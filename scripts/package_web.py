"""打包 GitHub Pages 源码和可直接上传到静态站点的 web 目录。"""
import os
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent
SKIP = {'.git', '.venv', '.agents', '.codex', '.aws', 'results', '__pycache__', '.pytest_cache', 'node_modules'}


def main():
    output = ROOT / 'results'
    output.mkdir(exist_ok=True)
    source_zip = output / 'traitladder-github-pages.zip'
    with ZipFile(source_zip, 'w', ZIP_DEFLATED) as archive:
        for parent, directories, files in os.walk(ROOT):
            directories[:] = [d for d in directories if d not in SKIP]
            for name in files:
                source = Path(parent) / name
                if not source.is_symlink() and not name.endswith('.pyc'):
                    archive.write(source, source.relative_to(ROOT))
    static_zip = output / 'traitladder-static-site.zip'
    with ZipFile(static_zip, 'w', ZIP_DEFLATED) as archive:
        for source in (ROOT / 'web').rglob('*'):
            if source.is_file() and not source.is_symlink():
                archive.write(source, source.relative_to(ROOT / 'web'))
    for zip_path in (source_zip, static_zip):
        with ZipFile(zip_path) as archive:
            assert archive.testzip() is None
            print(zip_path, f'{len(archive.namelist())} files, {zip_path.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
