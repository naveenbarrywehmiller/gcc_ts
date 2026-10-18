import api from '../services/api';

export async function downloadCatalog(path, params, filename) {
  const response = await api.get(path, { params, responseType: 'blob' });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importSummary(data) {
  return `${data.created} created, ${data.updated} updated, ${data.deactivated} deactivated`;
}
