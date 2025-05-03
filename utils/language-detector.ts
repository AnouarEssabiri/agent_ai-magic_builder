// import { franc } from 'franc';
// import * as langs from 'langs';

// /**
//  * Detect the language of a text document
//  */
// export async function detectLanguage(text: string): Promise<string> {
//   try {
//     // Get a sample of the text (first 1000 chars)
//     const sample = text.substring(0, 1000);
    
//     // Detect language code using franc
//     const languageCode = franc(sample);
    
//     if (languageCode === 'und') {
//       return 'unknown';
//     }
    
//     // Convert language code to full name
//     const language = langs.where('3', languageCode);
//     return language ? language.name : 'unknown';
//   } catch (error) {
//     console.error('Language detection failed:', error);
//     return 'unknown';
//   }
// }
// language-detector.ts
// Use dynamic import to load franc as an ES Module
import * as langs from 'langs';

/**
 * Detect the language of a text document
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    // Get a sample of the text (first 1000 chars)
    const sample = text.substring(0, 1000);
    
    // Dynamically import franc
    const francModule = await import('franc');
    const franc = francModule.franc || francModule.default;
    
    // Detect language code using franc
    const languageCode = franc(sample);
    
    if (languageCode === 'und') {
      return 'unknown';
    }
    
    // Convert language code to full name
    const language = langs.where('3', languageCode);
    return language ? language.name : 'unknown';
  } catch (error) {
    console.error('Language detection failed:', error);
    return 'unknown';
  }
}