import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { extractTextWithInfo, isAvailable as isPdfNativeAvailable } from 'expo-pdf-text-extract';
import type { ChatContentPart } from './lmstudio';
import type { Attachment } from './store';

const MAX_TEXT_CHARS = 16000;
const ATTACHMENTS_DIR = 'attachments';
const IMAGE_QUALITY = 0.7;

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'xml', 'yaml', 'yml', 'log', 'ini', 'cfg',
  'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'cs',
  'go', 'rs', 'rb', 'php', 'sh', 'sql', 'toml',
];

export class AttachmentError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function isTextLike(mimeType: string | undefined, name: string): boolean {
  if (mimeType) {
    if (mimeType.startsWith('text/')) return true;
    if (mimeType === 'application/json' || mimeType === 'application/x-yaml') return true;
    if (mimeType.includes('xml')) return true;
  }
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.includes(ext);
}

function capText(raw: string): string {
  const text = raw.trim();
  if (text.length <= MAX_TEXT_CHARS) return text;
  const dropped = text.length - MAX_TEXT_CHARS;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n[...truncated, ${dropped} more characters]`;
}

function attachmentsDirectory(): Directory {
  const dir = new Directory(Paths.document, ATTACHMENTS_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Copies a picked image into the app's document directory so the message keeps working after
 * a restart (picker URIs live in the cache, which the OS is free to clear).
 */
async function copyImageToDocuments(sourceUri: string, name: string): Promise<string> {
  try {
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot) : '.jpg';
    const destination = new File(attachmentsDirectory(), `${uid()}${extension}`);
    await new File(sourceUri).copy(destination);
    return destination.uri;
  } catch {
    return sourceUri;
  }
}

export function isPdfExtractionAvailable(): boolean {
  return isPdfNativeAvailable();
}

function attachmentFromImageAsset(asset: ImagePicker.ImagePickerAsset): Attachment {
  const name = asset.fileName ?? `${uid()}.jpg`;
  return {
    id: uid(),
    kind: 'image',
    name,
    mimeType: asset.mimeType ?? 'image/jpeg',
    uri: asset.uri,
    sizeBytes: asset.fileSize,
  };
}

export async function pickImage(): Promise<Attachment | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: IMAGE_QUALITY,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const attachment = attachmentFromImageAsset(asset);
  return { ...attachment, uri: await copyImageToDocuments(asset.uri, attachment.name) };
}

export async function takePhoto(): Promise<Attachment | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new AttachmentError('Camera permission is required to take a photo.');
  }
  const result = await ImagePicker.launchCameraAsync({ quality: IMAGE_QUALITY });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const attachment = attachmentFromImageAsset(asset);
  return { ...attachment, uri: await copyImageToDocuments(asset.uri, attachment.name) };
}

export async function pickDocument(password?: string): Promise<Attachment | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const mimeType = asset.mimeType ?? '';
  const isPdf = mimeType === 'application/pdf' || asset.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    if (!isPdfExtractionAvailable()) {
      throw new AttachmentError(
        'PDF support needs a development build. Rebuild the app to enable it.',
      );
    }
    const info = await extractTextWithInfo(asset.uri, password);
    if (!info.success) {
      throw new AttachmentError(info.error ?? 'Could not read that PDF.', info.errorCode);
    }
    if (!info.text.trim()) {
      throw new AttachmentError(
        'No text found in that PDF — it looks like a scanned document, which text extraction cannot read.',
      );
    }
    return {
      id: uid(),
      kind: 'text',
      name: asset.name,
      mimeType: 'application/pdf',
      text: capText(info.text),
      sizeBytes: asset.size,
    };
  }

  if (isTextLike(mimeType, asset.name)) {
    const text = await new File(asset.uri).text();
    return {
      id: uid(),
      kind: 'text',
      name: asset.name,
      mimeType: mimeType || 'text/plain',
      text: capText(text),
      sizeBytes: asset.size,
    };
  }

  throw new AttachmentError(
    `Unsupported file type: ${mimeType || asset.name}. Attach an image, a PDF, or a text file.`,
  );
}

/** Best-effort cleanup of files copied into the document directory. */
export async function deleteAttachmentFiles(attachments: Attachment[]): Promise<void> {
  await Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.kind !== 'image' || !attachment.uri) return;
      try {
        const file = new File(attachment.uri);
        if (file.exists) file.delete();
      } catch {
        // best effort — a leftover file is harmless
      }
    }),
  );
}

/**
 * Turns a stored message into LM Studio request content. Text sources are folded into the text
 * block (the only mechanism a text-only model understands); images become OpenAI-style
 * `image_url` parts, which require a vision-capable model.
 */
export async function toRequestContent(
  text: string,
  attachments?: Attachment[],
): Promise<string | ChatContentPart[]> {
  if (!attachments || attachments.length === 0) return text;

  const textBlocks: string[] = [];
  if (text.trim()) textBlocks.push(text);

  const imageParts: ChatContentPart[] = [];
  for (const attachment of attachments) {
    if (attachment.kind === 'text' && attachment.text) {
      textBlocks.push(`--- ${attachment.name} ---\n${attachment.text}`);
      continue;
    }
    if (attachment.kind === 'image' && attachment.uri) {
      try {
        const base64 = await new File(attachment.uri).base64();
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${attachment.mimeType};base64,${base64}` },
        });
      } catch {
        textBlocks.push(`[Image "${attachment.name}" could not be read]`);
      }
    }
  }

  const combined = textBlocks.join('\n\n');
  if (imageParts.length === 0) return combined;
  return combined ? [{ type: 'text', text: combined }, ...imageParts] : imageParts;
}
