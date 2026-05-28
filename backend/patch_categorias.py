import re
import sys

filepath = r"c:\Users\alejandro.carvajal\Documents\langextract_ocr\backend\routers\categorias.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# We look for: x_user_id: Optional[int] = Header(None, alias="X-User-Id"),
# And if it is not immediately followed by x_user_rol_id, we add it.
pattern = r'(x_user_id:\s*Optional\[int\]\s*=\s*Header\(None,\s*alias="X-User-Id"\)[,]?)(?!\s*x_user_rol_id)'
replacement = r'\1\n    x_user_rol_id: Optional[int] = Header(None, alias="X-User-Rol-Id"),'

new_content = re.sub(pattern, replacement, content)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(new_content)

print("Patch applied to categorias.py")
