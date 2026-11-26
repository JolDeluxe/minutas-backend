# Script de exportación de base de datos a Excel (Ejecutivo)
# Para ejecutar en cualquier entorno:
# 1. Instalar dependencias si no las tienes:
#    pip install pymysql pandas openpyxl
#
# 2. Ejecutar (toma automáticamente las credenciales del .env si existe):
#    python exportar_minutas_excel.py
#
# 3. O especificando credenciales directas (ejemplo producción):
#    python exportar_minutas_excel.py --user root --password tu_pass --database diseno
