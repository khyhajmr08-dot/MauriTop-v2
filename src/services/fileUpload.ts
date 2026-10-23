import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';

/**
 * Uploads a file to Firebase Storage with progress tracking.
 * @param file The file to upload (File or Blob)
 * @param path The path in storage (e.g., 'services/image.jpg')
 * @param onProgress Callback for progress updates (0-100)
 * @returns Promise resolving to the download URL
 */
export function uploadFileWithProgress(
  file: File | Blob,
  path: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);

      // Add a 60 second timeout
      const timeout = setTimeout(() => {
        task.cancel();
        reject(new Error("Upload timed out after 60 seconds"));
      }, 60000);

      task.on(
        'state_changed',
        (snapshot) => {
          const percent = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          console.log(`Upload progress for ${path}: ${percent}%`);
          onProgress?.(percent);
        },
        (error) => {
          clearTimeout(timeout);
          console.error('UPLOAD ERROR:', error.code, error.message);
          reject(error);
        },
        async () => {
          clearTimeout(timeout);
          try {
            const url = await getDownloadURL(task.snapshot.ref);
            console.log(`Upload completed for ${path}: ${url}`);
            resolve(url);
          } catch (err) {
            console.error('FAILED TO GET DOWNLOAD URL:', err);
            reject(err);
          }
        }
      );
    } catch (err) {
      console.error('INITIAL UPLOAD ERROR:', err);
      reject(err);
    }
  });
}
