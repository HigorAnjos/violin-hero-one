import type { Recording, RecordingError } from '../game/audio';

/**
 * A gravação da partida de tarefa, da partida até a entrega (TaskResult), pela partida na fila (clientId). Fica só na
 * memória da visita: o Blob não vai no estado da navegação e gravação de criança não fica no aparelho sem o aluno
 * pedir o envio (aí ela entra na fila de envio, que guarda no IndexedDB até subir).
 */
const held = new Map<string, Recording | RecordingError>();

export function holdTaskRecording(clientId: string, recording: Recording | RecordingError): void {
  // Uma por vez: a da tarefa anterior que o aluno não enviou não fica esquecida na memória
  held.clear();
  held.set(clientId, recording);
}

export function taskRecording(clientId: string | undefined): Recording | RecordingError | undefined {
  return clientId ? held.get(clientId) : undefined;
}

export function releaseTaskRecording(clientId: string | undefined): void {
  if (clientId) held.delete(clientId);
}
