"""Install pinned CI CLIs after checking published release SHA-256 digests."""
import hashlib
import io
import platform
from pathlib import Path
import sys
import tarfile
import urllib.request

TOOLS = {
    'actionlint': ('rhysd/actionlint', '1.7.12', {
        'linux_amd64': '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
        'darwin_arm64': 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
        'darwin_amd64': '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
    }),
    'gitleaks': ('gitleaks/gitleaks', '8.30.1', {
        'linux_x64': '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
        'darwin_arm64': 'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5',
        'darwin_x64': 'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
    }),
}


def install(destination):
    destination.mkdir(parents=True, exist_ok=True)
    system = platform.system().lower()
    for name, (repo, version, hashes) in TOOLS.items():
        arch = 'arm64' if platform.machine() in ('arm64', 'aarch64') else 'amd64'
        if name == 'gitleaks' and arch == 'amd64':
            arch = 'x64'
        key = f'{system}_{arch}'
        digest = hashes[key]  # Unsupported platforms fail explicitly.
        url = f'https://github.com/{repo}/releases/download/v{version}/{name}_{version}_{key}.tar.gz'
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(32 * 1024 * 1024 + 1)
        if len(data) > 32 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != digest:
            raise ValueError(f'{name}: release checksum mismatch')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            member = archive.getmember(name)
            if not member.isfile():
                raise ValueError('Expected regular executable')
            (destination / name).write_bytes(archive.extractfile(member).read())
        (destination / name).chmod(0o755)
        print(f'{name} {version}: verified')


if __name__ == '__main__':
    install(Path(sys.argv[1]).resolve())
