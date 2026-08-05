import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import api from '../../services/api';

export default function Footer() {
  const [usersInfo, setUsersInfo] = useState({ online: null, total: null });

  useEffect(() => {
    api.get('/users/active-count')
      .then(res => {
        if (res.data) {
          setUsersInfo({
            online: res.data.online !== undefined ? res.data.online : null,
            total: res.data.total !== undefined ? res.data.total : res.data.count
          });
        }
      })
      .catch(err => console.error('Failed to fetch active users count', err));
  }, []);

  return (
    <footer className="py-4 px-6 border-t border-surface-200 dark:border-surface-800 text-sm text-surface-500 mt-auto bg-white dark:bg-surface-900">
      <div className="flex items-center justify-between">
        <p>&copy; {new Date().getFullYear()} TimeSheet. All rights reserved.</p>
        <div className="flex items-center gap-2" title="Online / Total Users">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <Users className="w-4 h-4 text-surface-400" />
          <span className="font-medium text-surface-700 dark:text-surface-300">
            {usersInfo.total !== null 
              ? (usersInfo.online !== null ? `${usersInfo.online} / ${usersInfo.total}` : usersInfo.total) 
              : '...'}
          </span>
        </div>
      </div>
    </footer>
  );
}
