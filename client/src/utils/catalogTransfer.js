import api from '../services/api';

export async function downloadCatalog(path, params, filename) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const response = await api.get(path, { params: { ...params, time_zone: timeZone }, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = response.headers['content-disposition']?.match(/filename="([^"]+)"/)?.[1] || filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importSummary(data) {
  return `${data.created} created, ${data.updated} updated, ${data.deactivated} deactivated`;
}
