import { ClassroomError, submissionAudioType, type ClassroomApi, type SubmitInput } from '../services/classroom';
import { recordingPath, UploadError, type UploadTarget } from '../services/recordingUpload';

/** Os campos de `meta` que a entrega põe na fila, além dos do caminho (RecordingMeta). */
export interface SubmissionMeta {
  classId: string;
  studentId: string;
  taskId: string;
  dueAt: string;
  /** A partida que vale, quando o servidor já respondeu por ela; sem ela, ele pega a melhor que conta. */
  playId?: string;
}

/**
 * A 0017 acrescenta a duração do áudio na entrega (p_audio_duration_ms). Até ela chegar ao contrato, o campo vai junto
 * e o supabaseClassroom só não o repassa.
 */
type SubmitWithDuration = SubmitInput & { audioDurationMs?: number };

/** O bucket não tem update: subir de novo o mesmo arquivo volta 409, e isso é o arquivo já lá. */
function alreadyUploaded(error: unknown): boolean {
  const cause = (error instanceof ClassroomError ? error.cause : error) as { statusCode?: string | number; status?: number } | undefined;
  return Number(cause?.statusCode ?? cause?.status) === 409;
}

/** offline: a fila inteira espera; server: esta gravação espera o recuo; o resto (tarefa fechada, revisada, de outro) não entra nunca. */
function uploadError(error: unknown): UploadError {
  if (!(error instanceof ClassroomError)) return new UploadError('offline', error);
  if (error.kind === 'offline') return new UploadError('offline', error);
  if (error.kind === 'server') return new UploadError('transient', error);
  return new UploadError('rejected', error);
}

/**
 * Para onde a gravação da entrega sobe: o arquivo no bucket submissions (caminho de recordingPath, tipo sem parâmetros)
 * e, com ele lá, a entrega da tarefa. A partida da tarefa sobe antes (a entrega pede uma partida que conta); enquanto
 * ela não sobe, a gravação espera. Reenviar é seguro: o arquivo que já está lá conta como enviado e a entrega troca a
 * anterior (até a revisão).
 */
export function submissionUploadTarget(api: ClassroomApi, flushPlays: (userId: string) => Promise<void>): UploadTarget {
  return {
    async upload(session, item) {
      const path = recordingPath(item);
      const type = submissionAudioType(item.mimeType);
      const meta = item.meta as Partial<SubmissionMeta>;
      if (!path || !type || !meta.taskId) throw new UploadError('rejected');
      try {
        await flushPlays(session.userId);
      } catch (cause) {
        throw new UploadError('transient', cause);
      }
      try {
        await api.uploadSubmissionAudio(path, item.blob, type);
      } catch (error) {
        if (!alreadyUploaded(error)) throw uploadError(error);
      }
      const input: SubmitWithDuration = { assignmentId: meta.taskId, playId: meta.playId || null, audioPath: path, audioDurationMs: Math.round(item.durationMs) };
      try {
        await api.submitAssignment(input);
      } catch (error) {
        throw uploadError(error);
      }
    },
  };
}
