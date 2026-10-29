from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"

def build():
    template = (SRC / "template.html").read_text(encoding="utf-8")
    menus = json.loads((SRC / "menus.json").read_text(encoding="utf-8"))
    encoded = json.dumps(menus, ensure_ascii=False, separators=(",", ":")).replace("</", "<" + chr(92) + "/")
    parts = {
        "__PROJECT_STYLE__": (SRC / "styles.css").read_text(encoding="utf-8"),
        "__PROJECT_DATA__": encoded,
        "__PROJECT_JS__": (SRC / "app.js").read_text(encoding="utf-8"),
        "__PROJECT_CAN_SCHEMA__": (SRC / "can-schema.json").read_text(encoding="utf-8").replace("</", "<" + chr(92) + "/"),
        "__PROJECT_CAN_CORE__": (SRC / "can.js").read_text(encoding="utf-8-sig"),
        "__PROJECT_CAN_UI__": (SRC / "can-ui.js").read_text(encoding="utf-8"),
    }
    for marker, content in parts.items():
        if template.count(marker) != 1:
            raise ValueError("Template marker must appear once: " + marker)
        template = template.replace(marker, content, 1)
    target = ROOT / "index.html"
    target.write_text(template, encoding="utf-8")
    print("Built index.html (" + str(len(menus)) + " menu records)")

if __name__ == "__main__":
    build()
