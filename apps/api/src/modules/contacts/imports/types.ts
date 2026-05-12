export const CONTACT_IMPORT_QUEUE = 'contact-import';

export interface ContactImportJobData {
  importId: string;
  tenantId: string;
  filePath: string;
  filename: string;
}

export interface ImportRowError {
  row: number;
  message: string;
}
