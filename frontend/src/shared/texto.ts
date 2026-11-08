/** Para buscar sin distinguir tildes ni mayúsculas. */
export const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
