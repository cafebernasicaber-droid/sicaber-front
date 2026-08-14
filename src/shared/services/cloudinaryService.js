// ─────────────────────────────────────────────────────────────
//  src/shared/services/cloudinaryService.js
//  ARCHIVO NUEVO
//
//  Sube imágenes directamente a Cloudinary desde el navegador
//  usando un "upload preset" sin firma (unsigned upload).
//
//  ⚠ PASO ÚNICO DE CONFIGURACIÓN (solo una vez):
//
//  1. Entra a https://cloudinary.com/console
//  2. Settings → Upload → Upload presets
//  3. Clic en "Add upload preset"
//  4. Signing mode → "Unsigned"
//  5. Folder → escribe "sicaber" (opcional, para organizar)
//  6. Guarda → copia el nombre del preset (ej: "sicaber_upload")
//  7. Reemplaza UPLOAD_PRESET abajo con ese nombre exacto
//
//  El CLOUD_NAME ya está configurado con tu cuenta.
// ─────────────────────────────────────────────────────────────

const CLOUD_NAME    = 'dwkdxelo4';
const UPLOAD_PRESET = 'sicaber_upload'; // ← cambia esto por el preset que crees

/**
 * Sube un archivo File/Blob a Cloudinary y retorna la URL segura.
 * @param {File} file - El archivo de imagen a subir
 * @param {function} onProgress - Callback opcional con % de progreso (0-100)
 * @returns {Promise<string>} - URL segura de la imagen en Cloudinary
 */
export const uploadToCloudinary = (file, onProgress) => {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'sicaber');

    const xhr = new XMLHttpRequest();
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

    xhr.open('POST', url);

    // Progreso de subida
    if (onProgress) {
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data.secure_url);
        } catch {
          reject(new Error('Respuesta inválida de Cloudinary'));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.error?.message || `Error ${xhr.status}`));
        } catch {
          reject(new Error(`Error al subir imagen (${xhr.status})`));
        }
      }
    };

    xhr.onerror = () => reject(new Error('Error de red al subir la imagen'));
    xhr.send(formData);
  });
};

/**
 * Valida que el archivo sea una imagen válida y no supere el tamaño máximo.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateImageFile = file => {
  if (!file) return { valid: false, error: 'No se seleccionó ningún archivo.' };
  const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
  if (!allowed.includes(file.type)) return { valid: false, error: 'Solo se aceptan PNG, JPG, WEBP o GIF.' };
  if (file.size > 8 * 1024 * 1024) return { valid: false, error: 'La imagen no puede superar 8 MB.' };
  return { valid: true };
};
