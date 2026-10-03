#!/usr/bin/env python3
"""Offline validation of project docs and workspaces, never live tests."""
from pathlib import Path
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md', 'START_HERE.md', 'NEXT_TASK.md', 'AGENTS.md',
    'docs/README.md', 'docs/PRODUCT.md', 'docs/ARCHITECTURE.md',
    'docs/ROADMAP.md', 'docs/BACKLOG.md', 'docs/PHASE0_FEASIBILITY.md',
    'docs/PROVIDER_EVALUATION.md', 'docs/ACCEPTANCE_AND_TEST_PLAN.md',
    'docs/RISKS_AND_OPEN_QUESTIONS.md', 'docs/DECISIONS.md',
    'docs/SOURCES.md', 'docs/DEVELOPMENT.md', 'docs/SETUP_VERIFICATION.md',
    'docs/evidence/README.md', 'docs/evidence/runs/README.md',
    'docs/evidence/templates/session.md',
    'docs/evidence/templates/capability-matrix.md',
    'docs/evidence/templates/mapping-case.md',
    'docs/evidence/templates/decision.md', 'tests/README.md',
    'tests/fixtures/README.md', 'scripts/check_docs.py', '.gitignore',
    'package.json',
]
WORKSPACES = [
    'apps/chrome-extension', 'apps/safari-extension', 'apps/macos',
    'packages/core', 'packages/ui', 'packages/sports-engine',
    'packages/yttv-adapter', 'packages/event-resolver',
    'packages/quadbox', 'packages/storage',
]
LINK = re.compile(r'(?<!!)\[[^\]\n]+\]\(([^\n)]+)\)')


def anchors(path):
    result = set()
    seen = {}
    in_fence = False
    for line in path.read_text(encoding='utf-8').splitlines():
        if line.lstrip().startswith('```'):
            in_fence = not in_fence
        if in_fence:
            continue
        match = re.match(r'^#{1,6}\s+(.+?)\s*#*$', line)
        if match:
            title = re.sub(r'[^\w\s-]', '', match.group(1).lower())
            slug = re.sub(r'\s', '-', title)
            repeat = seen.get(slug, 0)
            seen[slug] = repeat + 1
            result.add(slug if not repeat else f'{slug}-{repeat}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository-only', action='store_true',
                        help='Compatibility alias; all documentation checks are repository-local')
    parser.add_argument('--write-report', action='store_true',
                        help='Write setup-only SHA-256 inventory to docs/setup-validation.json')
    parser.add_argument('--report-path', default='docs/setup-validation.json',
                        help='Relative output path; use docs/local-verification.json after initial setup')
    args = parser.parse_args()
    report_path = (ROOT / args.report_path).resolve()
    if not report_path.is_relative_to(ROOT) or report_path.suffix != '.json':
        parser.error('Report path must be a JSON file within this project')
    errors = []
    local_count = external_count = 0
    missing_local_artifacts = []
    for name in REQUIRED:
        if not (ROOT / name).is_file():
            errors.append(f'Missing required file: {name}')
    tracker = ROOT.parent / 'yttv_next_steps.md'
    markdown = sorted(p for p in ROOT.rglob('*.md') if not any(part in {'node_modules', '.git', 'dist', '.local', '__pycache__'} for part in p.relative_to(ROOT).parts))
    for path in markdown:
        data = path.read_text(encoding='utf-8')
        if not data.strip():
            errors.append(f'Empty Markdown: {path}')
        if any(phrase in data.lower() for phrase in (
                'source cutoff', 'source-cutoff', 'mvp sentence was cut off',
                'missing continuation is unavailable')):
            errors.append(f'Superseded source-cutoff claim remains: {path}')
        for match in LINK.finditer(data):
            target = match.group(1).strip().strip('<>')
            parts = urlsplit(target)
            if parts.scheme in {'https', 'http', 'mailto'}:
                external_count += 1
                continue  # No network checks and no service behavior inference.
            if parts.scheme:
                errors.append(f'Unrecognized link scheme: {path}: {target}')
                continue
            local_count += 1
            dest = (path.parent / unquote(parts.path)).resolve() if parts.path else path
            # Retained records can reference a historical external pointer, never a setup dependency.
            if dest == tracker:
                missing_local_artifacts.append(f'{path.relative_to(ROOT)}: {target}')
                continue
            if not dest.is_relative_to(ROOT):
                errors.append(f'External filesystem dependency: {path}: {target}')
                continue
            pending_report = args.write_report and dest == report_path
            if not dest.exists() and not pending_report:
                # .gitignore keeps Markdown run notes but excludes the run's
                # generated artifacts. Their absence is expected in a checkout.
                local_artifact = (
                    dest.is_relative_to(ROOT / 'docs/evidence/runs')
                    and dest.suffix != '.md'
                ) or dest in {ROOT / 'docs/local-verification.json', ROOT / 'docs/setup-validation.json'} or dest.is_relative_to(ROOT / '.local')
                if local_artifact:
                    missing_local_artifacts.append(f'{path.relative_to(ROOT) if path.is_relative_to(ROOT) else path.name}: {target}')
                else:
                    errors.append(f'Broken local link: {path}: {target}')
            elif parts.fragment and dest.suffix == '.md':
                if unquote(parts.fragment) not in anchors(dest):
                    errors.append(f'Broken anchor: {path}: {target}')
    try:
        root_manifest = json.loads((ROOT / 'package.json').read_text())
        if root_manifest.get('private') is not True:
            errors.append('Root package must be private')
        if root_manifest.get('workspaces') != ['apps/*', 'packages/*']:
            errors.append('Root workspace paths differ from planned scaffold')
        names = set()
        for folder in WORKSPACES:
            manifest = json.loads((ROOT / folder / 'package.json').read_text())
            if not (ROOT / folder / 'README.md').is_file():
                errors.append(f'Missing workspace README: {folder}')
            if manifest.get('private') is not True:
                errors.append(f'Workspace must be private: {folder}')
            if manifest.get('name') in names:
                errors.append(f'Duplicate workspace name: {folder}')
            names.add(manifest.get('name'))
            if manifest.get('dependencies') or manifest.get('devDependencies'):
                errors.append(f'Unexpected dependencies: {folder}')
    except (OSError, ValueError) as exc:
        errors.append(f'Manifest check failed: {exc}')
    for path in sorted((ROOT / 'docs/evidence/templates').glob('*.md')):
        if 'Status: NOT RUN' not in path.read_text(encoding='utf-8'):
            errors.append(f'Template lacks explicit NOT RUN status: {path}')
    acceptance = (ROOT / 'docs/ACCEPTANCE_AND_TEST_PLAN.md').read_text(encoding='utf-8')
    for number in range(1, 19):
        if f'| U{number:02d} |' not in acceptance:
            errors.append(f'Missing explicit user acceptance criterion U{number:02d}')
    report = {
        'mode': 'repository-only',
        'scope': 'This command validates docs/workspaces only; product and live tests are recorded separately',
        'checked_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'result': 'FAIL' if errors else 'PASS',
        'markdown_files_checked': len(markdown),
        'local_links_checked': local_count,
        'external_links_seen_not_network_validated': external_count,
        'local_artifact_links_unavailable': missing_local_artifacts,
        'private_workspaces_checked': len(WORKSPACES),
        'explicit_user_acceptance_criteria_checked': 18,
        'errors': errors,
        'not_performed_by_this_command': ['product unit/fixture/browser tests', 'live playback/auth/entitlement inspection',
                    'provider APIs', 'protected capture', 'Safari/Windows/native qualification', 'owner acceptance'],
    }
    if args.write_report and not errors:
        inventory = {}
        for path in sorted(ROOT.rglob('*')):
            if not path.is_file() or any(part in {'.git', 'node_modules', 'dist', '.local', '__pycache__'} for part in path.relative_to(ROOT).parts):
                continue
            relative = path.relative_to(ROOT).as_posix()
            if relative in {'docs/setup-validation.json', 'docs/SETUP_VERIFICATION.md', args.report_path}:
                continue
            if '__pycache__' in path.parts:
                continue
            inventory[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
        report['file_sha256'] = inventory
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'file_sha256'}, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
