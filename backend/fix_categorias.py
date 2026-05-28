import re

filepath = r"c:\Users\alejandro.carvajal\Documents\langextract_ocr\backend\routers\categorias.py"
with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

new_lines = []
skip_next = False
for i, line in enumerate(lines):
    if skip_next:
        skip_next = False
        continue

    # Clean up double commas
    cleaned_line = line.replace(",,", ",")
    
    # If the line is X-User-Id without a comma at the end
    if 'alias="X-User-Id")' in cleaned_line and not cleaned_line.strip().endswith(','):
        # We need to add a comma, unless it's literally the last argument (which it isn't here)
        cleaned_line = cleaned_line.rstrip() + ",\n"
        
    # Check for duplicate x_user_rol_id lines
    if "x_user_rol_id: Optional[int] = Header(None, alias=\"X-User-Rol-Id\")" in cleaned_line:
        # Check if next line is also the same
        if i + 1 < len(lines) and "x_user_rol_id: Optional[int] = Header(None, alias=\"X-User-Rol-Id\")" in lines[i+1]:
            skip_next = True # Skip the next duplicate line
            
    new_lines.append(cleaned_line)

with open(filepath, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("categorias.py syntax fixed")
