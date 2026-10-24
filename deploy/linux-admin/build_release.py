"""Generate the full source reference and versioned distribution assets."""
from pathlib import Path
import argparse
import hashlib
import io
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent
SCRIPTS = ["VERSION", "install.sh", "timesheet", "manager.py", "admin_ui.py", "admin_system.py", "admin_funnel.py", "admin_common.py",
           "admin_ops.py", "admin_release.py", "compose.yaml", "build_release.py"]

def source_reference():
    text = "# GCC Timesheet Linux Admin: complete script reference\n\n"
    text += "Generated from the shipped files by `python3 deploy/linux-admin/build_release.py`. Do not edit this reference manually.\n\n"
    text += "See [the setup and operations guide](README.md) for installation, menus and troubleshooting.\n\n"
    for name in SCRIPTS:
        language = "python" if name.endswith(".py") else "yaml" if name.endswith(".yaml") else "bash" if name in ("install.sh", "timesheet") else "text"
        text += f"## {name}\n\n```{language}\n{(ROOT / name).read_text(encoding='utf-8').rstrip()}\n```\n\n"
    return text.rstrip() + "\n"

def build(check=False):
    reference = source_reference()
    path = ROOT / "SCRIPTS.md"
    if check:
        assert path.read_text(encoding="utf-8") == reference, "Regenerate SCRIPTS.md with build_release.py"
        return
    path.write_text(reference, encoding="utf-8", newline="\n")
    dist = ROOT.parent / "dist"
    dist.mkdir(exist_ok=True)
    files = SCRIPTS + ["README.md", "SCRIPTS.md"]
    archive = dist / "gcc-timesheet-linux-admin.tar.gz"
    with tarfile.open(archive, "w:gz") as bundle:
        for name in files:
            data = (ROOT / name).read_bytes()
            info = tarfile.TarInfo("timesheet-admin/" + name)
            info.size = len(data)
            info.mode = 0o755 if name in ("install.sh", "timesheet") else 0o644
            info.mtime = 0
            bundle.addfile(info, io.BytesIO(data))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (dist / (archive.name + ".sha256")).write_text(f"{digest}  {archive.name}\n", encoding="ascii")
    with zipfile.ZipFile(dist / "gcc-timesheet-linux-admin.zip", "w", zipfile.ZIP_DEFLATED) as bundle:
        for name in files:
            bundle.write(ROOT / name, "timesheet-admin/" + name)
    for name in ("README.md", "SCRIPTS.md", "install.sh"):
        (dist / name).write_bytes((ROOT / name).read_bytes())
    print(f"Built GCC Timesheet Linux Admin {(ROOT / 'VERSION').read_text().strip()} in {dist}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    build(parser.parse_args().check)
