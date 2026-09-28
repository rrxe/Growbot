// تصغير وضغط صورة السكرين شوت عبر canvas قبل تحويلها base64 —
// حتى تضل أقل من ~2-3 ميجا ومتوافقة مع حد الـ body الأعلى بالسيرفر (8mb)
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.72

export function compressImageToBase64(
  file: File
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onerror = () =>
      reject(new Error('تعذرت قراءة الصورة.'))

    reader.onload = () => {
      const img = new Image()

      img.onerror = () =>
        reject(new Error('تعذرت معالجة الصورة.'))

      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale =
            MAX_DIMENSION / Math.max(width, height)

          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')

        if (!ctx) {
          reject(new Error('تعذر إنشاء الصورة.'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        resolve(
          canvas.toDataURL('image/jpeg', JPEG_QUALITY)
        )
      }

      img.src = reader.result as string
    }

    reader.readAsDataURL(file)
  })
}
