import { GlazeStatus } from './types';

export const STATUS_LABELS: Record<GlazeStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  validated: 'Validado',
  published: 'Publicado',
  archived: 'Archivado'
};
