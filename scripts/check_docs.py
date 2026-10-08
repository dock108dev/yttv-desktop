#!/usr/bin/env python3
"""Check deliverable Markdown links and private workspace manifests offline."""
from pathlib import Path
import argparse
import json
import os
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'README.md', 'START_HERE.md', 'AGENTS.md', '.gitignore', 'package.json',
    'docs/README.md', 'docs/DEVELOPMENT.md', 'docs/ARCHITECTURE.md',
    'docs/ERROR_HANDLING.md', 'docs/SECURITY.md', 'docs/CI.md',
    'tests/README.md', 'tests/fixtures/README.md', 'scripts/check_docs.py',
]
LINK = re.compile(r'!?\[[^\]\n]+\]\(([^\n)]+)\)')


def source_files():
    # Include proposed, nonignored additions; retained local notes are not docs inputs.
    try:
        top = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT, stderr=subprocess.DEVNULL).decode().strip()
        if Path(top).resolve() == ROOT:
            raw = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
            return {ROOT / name for name in raw.decode().split('\0') if name and (ROOT / name).is_file()}
    except (OSError, subprocess.CalledProcessError):
        pass
    # A source archive/export has no Git metadata or ignored working files.
    files = set()
    for folder, directories, names in os.walk(ROOT):
        directories[:] = [name for name in directories if name not in {'.git', 'node_modules', 'dist', '.local', '__pycache__'}]
        files.update(Path(folder) / name for name in names)
    return files


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
    parser.add_argument('--repository-only', action='store_true', help='Alias for the default offline check')
    parser.parse_args()
    files = source_files()
    errors = [f'Missing required file: {name}' for name in REQUIRED if ROOT / name not in files]
    markdown = sorted(path for path in files if path.suffix == '.md')
    local_count = external_count = 0
    for path in markdown:
        data = path.read_text(encoding='utf-8')
        if not data.strip():
            errors.append(f'Empty Markdown: {path.relative_to(ROOT)}')
        for match in LINK.finditer(data):
            target = match.group(1).strip().strip('<>')
            parts = urlsplit(target)
            if parts.scheme in {'https', 'http', 'mailto'}:
                external_count += 1
                continue
            if parts.scheme:
                errors.append(f'Unrecognized link scheme: {path.relative_to(ROOT)}: {target}')
                continue
            local_count += 1
            dest = (path.parent / unquote(parts.path)).resolve() if parts.path else path
            if not dest.is_relative_to(ROOT):
                errors.append(f'External filesystem dependency: {path.relative_to(ROOT)}: {target}')
            elif not dest.exists():
                errors.append(f'Broken local link: {path.relative_to(ROOT)}: {target}')
            elif dest.is_file() and dest not in files:
                errors.append(f'Link to local-only file: {path.relative_to(ROOT)}: {target}')
            elif parts.fragment and dest.suffix == '.md' and unquote(parts.fragment) not in anchors(dest):
                errors.append(f'Broken anchor: {path.relative_to(ROOT)}: {target}')
    try:
        root_manifest = json.loads((ROOT / 'package.json').read_text())
        if root_manifest.get('private') is not True:
            errors.append('Root package must be private')
        folders = sorted(folder for pattern in root_manifest['workspaces'] for folder in ROOT.glob(pattern) if folder.is_dir())
        names = set()
        for folder in folders:
            manifest = json.loads((folder / 'package.json').read_text())
            if folder / 'README.md' not in files:
                errors.append(f'Missing workspace README: {folder.relative_to(ROOT)}')
            if manifest.get('private') is not True or not manifest.get('name'):
                errors.append(f'Workspace needs a name and private manifest: {folder.relative_to(ROOT)}')
            if manifest.get('name') in names:
                errors.append(f'Duplicate workspace name: {folder.relative_to(ROOT)}')
            names.add(manifest.get('name'))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        errors.append(f'Manifest check failed: {exc}')
    print(json.dumps({'mode': 'repository-only', 'result': 'FAIL' if errors else 'PASS',
                      'markdown_files_checked': len(markdown), 'local_links_checked': local_count,
                      'external_links_seen_not_network_validated': external_count, 'errors': errors}, indent=2))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
