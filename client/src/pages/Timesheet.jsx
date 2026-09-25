import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { TimesheetSkeleton } from '../components/ui/Skeleton';
import SearchableSelect from '../components/ui/SearchableSelect';
import Modal from '../components/ui/Modal';
import {
  ChevronLeft, ChevronRight, Plus, Send, Save, Trash2, AlertTriangle, Check,
  Calendar, CalendarDays, RotateCcw, MessageSquare, Info, Clock, Edit2
} from 'lucide-react';

/**
 * ISO 8601 week number (same as Outlook).
 */
function getISOWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
}

/**
 * Get Monday of a given ISO week.
 */
function getWeekMonday(weekNum, year) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  return targetMonday;
}

export default function Timesheet() {
  const toast = useToast();
  const { user, isAdmin } = useAuth();
  const [saving, setSaving] = useState(false);

  // Check admin ownership status for self-posting
  const { data: adminData } = useQuery({
    queryKey: ['my-admin'],
    queryFn: async () => {
      const res = await api.get('/admin-ownership/my-admin');
      return res.data;
    }
  });
  const hasAssignedAdmin = !!adminData?.admin;
  const canSelfPost = (isAdmin || user?.role === 'admin') && !hasAssignedAdmin;
  const [currentWeekInfo, setCurrentWeekInfo] = useState(() => getISOWeekInfo(new Date()));
  const [entries, setEntries] = useState([]);
  
  // Masters
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [subdivisions, setSubdivisions] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [departmentOwnerships, setDepartmentOwnerships] = useState([]);
  
  const [rows, setRows] = useState([]);
  
  // Add/Edit Row Modal State
  const [showAddRow, setShowAddRow] = useState(false);
  const [editingRowIdx, setEditingRowIdx] = useState(null);
  const [newRowDivision, setNewRowDivision] = useState(null);
  const [newRowSubdivision, setNewRowSubdivision] = useState(null);
  const [newRowProject, setNewRowProject] = useState(null);
  const [newRowProjectDesc, setNewRowProjectDesc] = useState('');
  const [newRowTask, setNewRowTask] = useState(null);
  const [newRowOwnership, setNewRowOwnership] = useState(null);
  
  // UI State
  const [showRecallModal, setShowRecallModal] = useState(false);
  const [recallComment, setRecallComment] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const calendarRef = useRef(null);
  const saveTimerRef = useRef(null);
  const dirtyRef = useRef(new Set()); // tracks changed (rowIndex,date) pairs for delta auto-save

  const { week, year } = currentWeekInfo;

  // Generate 7 day columns (Mon–Sun)
  const monday = getWeekMonday(week, year);
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + i);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return {
      date: `${y}-${m}-${d}`,
      day: date.getUTCDate(),
      month: date.toLocaleString('default', { month: 'short' }),
      weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
      isWeekend: i >= 5,
      dow: date.getUTCDay(),
    };
  });

  const weekLabel = `${days[0].month} ${days[0].day} – ${days[6].month} ${days[6].day}, ${year}`;
  const holidayDates = new Set(holidays.map(h => h.date));
  const holidayNames = {};
  holidays.forEach(h => { holidayNames[h.date] = h.name; });

  const { data: fetchedData, isLoading: loading, isError } = useQuery({
    queryKey: ['timesheet', week, year, refreshTrigger],
    queryFn: async () => {
      const fetches = [
        api.get(`/timesheets?week=${week}&year=${year}`),
        api.get('/projects?active=1'),
        api.get('/tasks?active=1'),
        api.get('/divisions?active=1'),
        api.get('/subdivisions?active=1'),
        api.get(`/holidays?year=${year}`),
      ];
      // Fetch ownerships for the user's department (if assigned)
      if (user?.department_id) {
        fetches.push(api.get(`/department-ownerships?department_id=${user.department_id}&active=1`));
      }
      const results = await Promise.all(fetches);
      const [tsRes, pRes, tkRes, divRes, subRes, hRes] = results;
      return {
        entries: tsRes.data.entries,
        projects: pRes.data.projects,
        tasks: tkRes.data.tasks,
        divisions: divRes.data.divisions,
        subdivisions: subRes.data.subdivisions,
        holidays: hRes.data.holidays,
        ownerships: results[6]?.data?.ownerships || []
      };
    }
  });

  useEffect(() => {
    if (isError) {
      toast.error('Failed to load timesheet data');
    }
  }, [isError, toast]);

  useEffect(() => {
    if (fetchedData) {
      setEntries(fetchedData.entries);
      setProjects(fetchedData.projects);
      setTasks(fetchedData.tasks);
      setDivisions(fetchedData.divisions);
      setSubdivisions(fetchedData.subdivisions);
      setHolidays(fetchedData.holidays);
      setDepartmentOwnerships(fetchedData.ownerships || []);

      const rowMap = {};
      fetchedData.entries.forEach(e => {
        const key = `${e.project_id || 'null'}-${e.task_id || 0}-${e.division_id || 0}-${e.subdivision_id || 0}-${e.project_description || ''}-${e.ownership_id || 0}`;
        if (!rowMap[key]) {
          rowMap[key] = {
            project_id: e.project_id,
            task_id: e.task_id,
            division_id: e.division_id,
            subdivision_id: e.subdivision_id,
            project_description: e.project_description,
            ownership_id: e.ownership_id,
            ownership_label: e.ownership_label,
            project_code: e.project_code,
            project_name: e.project_name,
            division_name: e.division_name,
            subdivision_name: e.subdivision_name,
            task_category: e.task_category,
            task_desc: e.task_desc,
            classification: e.classification,
            requires_project: e.requires_project,
            hours: {},
            descriptions: {},
            status: e.status,
            admin_comment: e.admin_comment,
          };
        }
        rowMap[key].hours[e.work_date] = e.hours;
        rowMap[key].descriptions[e.work_date] = e.description;
        if (['submitted', 'approved', 'recalled'].includes(e.status)) {
          rowMap[key].status = e.status;
        }
        if (e.admin_comment) {
          rowMap[key].admin_comment = e.admin_comment;
        }
      });
      setRows(Object.values(rowMap));
    }
  }, [fetchedData]);

  // Auto-save debounce (60s — delta-only for 500+ employee scale)
  const scheduleAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (dirtyRef.current.size === 0) return;
      handleSave(true);
    }, 60000);
  }, [rows]);

  // Weekend/holiday warning tracking (per date, shown once per session)
  const warnedDatesRef = useRef(new Set());

  // Update hours for a cell
  const updateHours = (rowIndex, date, value) => {
    const numVal = value === '' ? 0 : parseFloat(value);
    if (isNaN(numVal) || numVal < 0 || numVal > 24) return;

    // Show weekend/holiday warning (informational only — does NOT block saving)
    if (numVal > 0 && !warnedDatesRef.current.has(date)) {
      const dateObj = new Date(date + 'T00:00:00');
      const dow = dateObj.getDay(); // 0=Sun, 6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const isHolidayDate = holidayDates.has(date);

      if (isWeekend && isHolidayDate) {
        toast.warning(`Warning: ${date} is a weekend and a company holiday (${holidayNames[date]}). You can still enter hours, but please verify that the entry is correct.`);
        warnedDatesRef.current.add(date);
      } else if (isWeekend) {
        toast.warning(`Warning: ${date} is a weekend. You can still enter hours, but please verify that the entry is correct.`);
        warnedDatesRef.current.add(date);
      } else if (isHolidayDate) {
        toast.warning(`Warning: ${date} is a company holiday (${holidayNames[date]}). You can still enter hours, but please verify that the entry is correct.`);
        warnedDatesRef.current.add(date);
      }
    }

    setRows(prev => {
      const updated = [...prev];
      updated[rowIndex] = {
        ...updated[rowIndex],
        hours: { ...updated[rowIndex].hours, [date]: numVal },
      };
      return updated;
    });
    dirtyRef.current.add(`${rowIndex}:${date}`);
    scheduleAutoSave();
  };

  // Calculate totals
  const getRowTotal = (row) => Object.values(row.hours).reduce((sum, h) => sum + (h || 0), 0);
  const getDayTotal = (date) => rows.reduce((sum, row) => sum + (row.hours[date] || 0), 0);
  const getGrandTotal = () => rows.reduce((sum, row) => sum + getRowTotal(row), 0);

  // Cascading options for Add Row modal
  const modalSubdivisionOptions = useMemo(() => {
    if (!newRowDivision) return [];
    return subdivisions.filter(s => s.division_id === newRowDivision);
  }, [subdivisions, newRowDivision]);

  const modalProjectOptions = useMemo(() => {
    let filtered = projects;
    if (newRowDivision) {
      filtered = filtered.filter(p => p.division_id === newRowDivision);
    }
    if (newRowSubdivision) {
      filtered = filtered.filter(p => p.subdivision_id === newRowSubdivision);
    }
    return filtered;
  }, [projects, newRowDivision, newRowSubdivision]);

  // Determine if the selected task requires a project
  const selectedTaskRequiresProject = useMemo(() => {
    if (!newRowTask) return true; // Default: show project fields
    const task = tasks.find(t => t.id === newRowTask);
    return task ? task.requires_project === 1 : true;
  }, [newRowTask, tasks]);

  // Reset cascades
  useEffect(() => {
    setNewRowSubdivision(null);
    setNewRowProject(null);
  }, [newRowDivision]);

  useEffect(() => {
    setNewRowProject(null);
  }, [newRowSubdivision]);

  // When task category changes, reset project fields if not needed
  useEffect(() => {
    if (!selectedTaskRequiresProject) {
      setNewRowDivision(null);
      setNewRowSubdivision(null);
      setNewRowProject(null);
      setNewRowProjectDesc('');
    }
  }, [newRowTask, selectedTaskRequiresProject]);

  // Cumulative hours for selected project (client-side calculation)
  const cumulativeHoursForProject = useMemo(() => {
    if (!newRowProject) return 0;
    return rows
      .filter(r => r.project_id === newRowProject)
      .reduce((sum, r) => sum + getRowTotal(r), 0);
  }, [newRowProject, rows]);

  // Reset row modal form fields
  const resetRowForm = () => {
    setEditingRowIdx(null);
    setNewRowProject(null);
    setNewRowTask(null);
    setNewRowDivision(null);
    setNewRowSubdivision(null);
    setNewRowProjectDesc('');
    setNewRowOwnership(null);
  };

  // Open edit row modal
  const openEditRow = (row, index) => {
    setEditingRowIdx(index);
    setNewRowTask(row.task_id);
    setNewRowDivision(row.division_id);
    setNewRowSubdivision(row.subdivision_id);
    setNewRowProject(row.project_id);
    setNewRowProjectDesc(row.project_description || '');
    setNewRowOwnership(row.ownership_id);
    setShowAddRow(true);
  };

  // Add or update a project row
  const handleAddRow = () => {
    if (!newRowTask) { toast.warning('Please select a task category'); return; }
    if (selectedTaskRequiresProject && !newRowProject) { toast.warning('Please select a project category'); return; }

    const exists = rows.some((r, i) => {
      if (editingRowIdx !== null && i === editingRowIdx) return false;
      if (selectedTaskRequiresProject) {
        return r.project_id === newRowProject && 
          r.task_id === (newRowTask || null) &&
          r.division_id === (newRowDivision || null) &&
          r.subdivision_id === (newRowSubdivision || null) &&
          r.project_description === (newRowProjectDesc || null);
      } else {
        // Non-project row: match by task_id only
        return r.task_id === newRowTask && !r.project_id;
      }
    });
    if (exists) { toast.warning('This exact row combination already exists'); return; }

    const project = selectedTaskRequiresProject ? projects.find(p => p.id === newRowProject) : null;
    const task = tasks.find(t => t.id === newRowTask);
    const division = divisions.find(d => d.id === newRowDivision);
    const subdivision = subdivisions.find(s => s.id === newRowSubdivision);
    const ownership = departmentOwnerships.find(o => o.id === newRowOwnership);

    if (editingRowIdx !== null) {
      const oldRow = rows[editingRowIdx];
      const isChangedKey = oldRow.project_id !== (selectedTaskRequiresProject ? newRowProject : null) ||
                           oldRow.task_id !== (newRowTask || null);

      if (isChangedKey && Object.keys(oldRow.hours || {}).length > 0) {
        // Remove old entries from DB by sending hours: 0
        const deleteOldEntries = Object.entries(oldRow.hours)
          .filter(([_, h]) => h > 0)
          .map(([date]) => ({
            project_id: oldRow.project_id,
            task_id: oldRow.task_id,
            work_date: date,
            hours: 0
          }));
        if (deleteOldEntries.length > 0) {
          api.post('/timesheets/batch', { entries: deleteOldEntries }).catch(() => {});
        }
      }

      setRows(prev => prev.map((r, i) => {
        if (i !== editingRowIdx) return r;
        return {
          ...r,
          project_id: selectedTaskRequiresProject ? newRowProject : null,
          task_id: newRowTask || null,
          division_id: selectedTaskRequiresProject ? (newRowDivision || null) : null,
          subdivision_id: selectedTaskRequiresProject ? (newRowSubdivision || null) : null,
          project_description: selectedTaskRequiresProject ? (newRowProjectDesc || null) : null,
          ownership_id: selectedTaskRequiresProject ? (newRowOwnership || null) : null,
          ownership_label: selectedTaskRequiresProject ? (ownership?.label || null) : null,
          project_code: project?.project_code || null,
          project_name: project?.project_name || null,
          division_name: selectedTaskRequiresProject ? division?.name : null,
          subdivision_name: selectedTaskRequiresProject ? subdivision?.name : null,
          task_category: task?.task_category || '',
          task_desc: task?.task_description || '',
          classification: task?.classification || '',
          requires_project: task?.requires_project,
        };
      }));

      // Mark cells of updated row dirty so delta auto-save or manual save saves them with new metadata
      Object.keys(oldRow.hours || {}).forEach(date => {
        dirtyRef.current.add(`${editingRowIdx}:${date}`);
      });

      resetRowForm();
      setShowAddRow(false);
      toast.success('Row updated');
      setTimeout(() => handleSave(true), 150);
      return;
    }

    setRows(prev => [...prev, {
      project_id: selectedTaskRequiresProject ? newRowProject : null,
      task_id: newRowTask || null,
      division_id: selectedTaskRequiresProject ? (newRowDivision || null) : null,
      subdivision_id: selectedTaskRequiresProject ? (newRowSubdivision || null) : null,
      project_description: selectedTaskRequiresProject ? (newRowProjectDesc || null) : null,
      ownership_id: selectedTaskRequiresProject ? (newRowOwnership || null) : null,
      ownership_label: selectedTaskRequiresProject ? (ownership?.label || null) : null,
      project_code: project?.project_code || null,
      project_name: project?.project_name || null,
      division_name: selectedTaskRequiresProject ? division?.name : null,
      subdivision_name: selectedTaskRequiresProject ? subdivision?.name : null,
      task_category: task?.task_category || '',
      task_desc: task?.task_description || '',
      classification: task?.classification || '',
      requires_project: task?.requires_project,
      hours: {},
      descriptions: {},
      status: 'draft',
    }]);

    resetRowForm();
    setShowAddRow(false);
    toast.success('Row added');
  };

  // Remove a row
  const removeRow = (index) => {
    if (rows[index].status === 'approved') { toast.error('Cannot remove approved entries'); return; }
    if (rows[index].status === 'submitted') { toast.error('Cannot remove submitted entries'); return; }
    const row = rows[index];
    const deleteEntries = Object.entries(row.hours || {})
      .filter(([_, h]) => h > 0)
      .map(([date]) => ({
        project_id: row.project_id,
        task_id: row.task_id,
        work_date: date,
        hours: 0
      }));
    if (deleteEntries.length > 0) {
      api.post('/timesheets/batch', { entries: deleteEntries }).catch(() => {});
    }
    setRows(prev => prev.filter((_, i) => i !== index));
    toast.info('Row removed');
  };

  // Extract all entries with hours > 0 from current rows
  const getAllEntries = () => {
    const all = [];
    rows.forEach((row) => {
      Object.entries(row.hours || {}).forEach(([date, hours]) => {
        const numHours = parseFloat(hours) || 0;
        if (numHours > 0) {
          all.push({
            project_id: row.project_id,
            task_id: row.task_id,
            division_id: row.division_id,
            subdivision_id: row.subdivision_id,
            project_description: row.project_description,
            ownership_id: row.ownership_id,
            work_date: date,
            hours: numHours,
            description: row.descriptions?.[date] || null,
          });
        }
      });
    });
    return all;
  };

  // Save all entries (or delta-only for auto-save)
  const handleSave = async (silent = false, forceAll = false) => {
    setSaving(true);
    try {
      const isAutoSave = silent && !forceAll; // only delta if auto-save AND not forced
      const dirtyKeys = isAutoSave ? dirtyRef.current : null;
      const allEntries = [];

      rows.forEach((row, rowIndex) => {
        Object.entries(row.hours || {}).forEach(([date, hours]) => {
          const cellKey = `${rowIndex}:${date}`;
          // Auto-save: only send cells that changed
          if (isAutoSave && !dirtyKeys.has(cellKey)) return;
          const numHours = parseFloat(hours) || 0;
          if (numHours > 0) {
            allEntries.push({
              project_id: row.project_id,
              task_id: row.task_id,
              division_id: row.division_id,
              subdivision_id: row.subdivision_id,
              project_description: row.project_description,
              ownership_id: row.ownership_id,
              work_date: date,
              hours: numHours,
              description: row.descriptions?.[date] || null,
            });
          }
        });
      });

      if (allEntries.length > 0) {
        await api.post('/timesheets/batch', { entries: allEntries });
      }
      dirtyRef.current.clear();
      if (!silent) toast.success('Timesheet saved');
    } catch (err) {
      if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error('Failed to save timesheet');
      }
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Admin self-post timesheet (allowed if no other admin assigned)
  const handlePost = async () => {
    try {
      const entriesToPost = getAllEntries();
      if (entriesToPost.length === 0) {
        toast.warning('Please enter hours before posting your timesheet');
        return;
      }
      // 1. Force-save all entries first
      await handleSave(true, true);
      // 2. Post with entries included in request
      const res = await api.post('/timesheets/post', {
        week,
        year,
        entries: entriesToPost
      });
      toast.success(res.data.message || 'Timesheet posted successfully');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to post timesheet');
    }
  };

  // Submit for approval
  const handleSubmit = async () => {
    try {
      const entriesToSubmit = getAllEntries();
      if (entriesToSubmit.length === 0) {
        toast.warning('Please enter hours before submitting your timesheet');
        return;
      }
      await handleSave(true, true);
      await api.post('/timesheets/submit', { week, year });
      toast.success('Timesheet submitted for approval');
      // Reload
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit');
    }
  };

  // Recall (employee self-recall)
  const handleRecall = async () => {
    try {
      await api.post('/timesheets/recall', { week, year, comment: recallComment });
      toast.success('Timesheet recalled for correction');
      setShowRecallModal(false);
      setRecallComment('');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to recall');
    }
  };

  // Navigate weeks
  const prevWeek = () => {
    const mon = getWeekMonday(week, year);
    mon.setUTCDate(mon.getUTCDate() - 7);
    setCurrentWeekInfo(getISOWeekInfo(new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate())));
  };
  const nextWeek = () => {
    const mon = getWeekMonday(week, year);
    mon.setUTCDate(mon.getUTCDate() + 7);
    setCurrentWeekInfo(getISOWeekInfo(new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate())));
  };
  const goToCurrentWeek = () => {
    setCurrentWeekInfo(getISOWeekInfo(new Date()));
  };

  // Calendar picker helpers
  const toggleCalendar = () => {
    if (!showCalendar) {
      // Sync calendar view to currently selected week
      const mon = getWeekMonday(week, year);
      setCalendarMonth(mon.getUTCMonth());
      setCalendarYear(mon.getUTCFullYear());
    }
    setShowCalendar(!showCalendar);
  };

  const selectWeekFromDate = (day) => {
    const selected = new Date(calendarYear, calendarMonth, day);
    setCurrentWeekInfo(getISOWeekInfo(selected));
    setShowCalendar(false);
  };

  const calendarPrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(calendarYear - 1);
    } else {
      setCalendarMonth(calendarMonth - 1);
    }
  };

  const calendarNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(calendarYear + 1);
    } else {
      setCalendarMonth(calendarMonth + 1);
    }
  };

  // Build calendar grid data
  const getCalendarDays = () => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    // ISO: Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells = [];
    // Previous month fill
    const prevMonthLast = new Date(calendarYear, calendarMonth, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push({ day: prevMonthLast - i, isCurrentMonth: false });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isCurrentMonth: true });
    }
    // Next month fill
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, isCurrentMonth: false });
      }
    }
    return cells;
  };

  // Check if a calendar date falls in the currently selected week
  const isInSelectedWeek = (day, isCurrentMonth) => {
    if (!isCurrentMonth) return false;
    const d = new Date(calendarYear, calendarMonth, day);
    const info = getISOWeekInfo(d);
    return info.week === week && info.year === year;
  };

  // Check if a calendar date is today
  const isToday = (day, isCurrentMonth) => {
    if (!isCurrentMonth) return false;
    const now = new Date();
    return day === now.getDate() && calendarMonth === now.getMonth() && calendarYear === now.getFullYear();
  };

  // Close calendar when clicking outside
  useEffect(() => {
    if (!showCalendar) return;
    const handleClick = (e) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showCalendar]);

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const { week: todayWeek, year: todayYear } = getISOWeekInfo(new Date());
  const isCurrentWeek = week === todayWeek && year === todayYear;

  const hasSubmitted = rows.some(r => r.status === 'submitted');
  const allApproved = rows.length > 0 && rows.every(r => r.status === 'approved');
  const hasRecalled = rows.some(r => r.status === 'recalled');
  const hasDrafts = rows.some(r => r.status === 'draft' || r.status === 'rejected' || r.status === 'recalled');
  const isEditable = !hasSubmitted && !allApproved;
  const adminComment = rows.find(r => r.admin_comment)?.admin_comment;

  // Determine overall week status
  const getWeekStatus = () => {
    if (allApproved) return 'approved';
    if (hasSubmitted) return 'submitted';
    if (hasRecalled) return 'recalled';
    if (rows.some(r => r.status === 'rejected')) return 'rejected';
    return 'draft';
  };
  const weekStatus = getWeekStatus();

  if (loading) return <TimesheetSkeleton />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={prevWeek} className="btn-ghost btn-sm p-1.5" id="prev-week-btn">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center min-w-[260px]">
              <h2 className="text-xl font-bold text-surface-900 dark:text-white">
                Week {week}
              </h2>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {weekLabel}
              </p>
            </div>
            <button onClick={nextWeek} className="btn-ghost btn-sm p-1.5" id="next-week-btn">
              <ChevronRight className="w-5 h-5" />
            </button>

            {/* Calendar dropdown picker */}
            <div className="relative" ref={calendarRef}>
              <button
                onClick={toggleCalendar}
                className={`btn-ghost btn-sm p-1.5 ml-0.5 ${
                  showCalendar ? 'bg-brand-50 text-brand-600 dark:bg-brand-950/30 dark:text-brand-400' : ''
                }`}
                title="Pick week from calendar"
              >
                <CalendarDays className="w-5 h-5" />
              </button>

              {showCalendar && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-[300px]
                  bg-white dark:bg-surface-900 rounded-xl border border-surface-200 dark:border-surface-700
                  shadow-xl shadow-surface-900/10 dark:shadow-black/30
                  animate-scale-in origin-top"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
                    <button onClick={calendarPrevMonth} className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 dark:text-surface-400 transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">
                      {monthNames[calendarMonth]} {calendarYear}
                    </span>
                    <button onClick={calendarNextMonth} className="p-1 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-500 dark:text-surface-400 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 px-3 pt-2 pb-1">
                    {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
                      <div key={d} className="text-center text-[10px] font-semibold text-surface-400 dark:text-surface-500 py-1">
                        {d}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 px-3 pb-3 gap-y-0.5">
                    {getCalendarDays().map((cell, idx) => {
                      const inWeek = isInSelectedWeek(cell.day, cell.isCurrentMonth);
                      const today = isToday(cell.day, cell.isCurrentMonth);

                      return (
                        <button
                          key={idx}
                          onClick={() => cell.isCurrentMonth && selectWeekFromDate(cell.day)}
                          disabled={!cell.isCurrentMonth}
                          className={`relative h-8 text-xs font-medium rounded-md transition-all
                            ${!cell.isCurrentMonth
                              ? 'text-surface-300 dark:text-surface-700 cursor-default'
                              : inWeek
                                ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 font-semibold'
                                : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-800 cursor-pointer'
                            }
                            ${today ? 'ring-2 ring-brand-500 ring-offset-1 ring-offset-white dark:ring-offset-surface-900' : ''}
                          `}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>

                  <div className="border-t border-surface-100 dark:border-surface-800 px-4 py-2">
                    <button
                      onClick={() => { goToCurrentWeek(); setShowCalendar(false); }}
                      className="w-full text-center text-xs font-medium text-brand-600 dark:text-brand-400
                        hover:bg-brand-50 dark:hover:bg-brand-950/20 rounded-lg py-1.5 transition-colors"
                    >
                      Go to current week
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!isCurrentWeek && (
              <button onClick={goToCurrentWeek} className="btn-ghost btn-sm text-xs ml-1">
                <Calendar className="w-3.5 h-3.5 mr-1" />
                Today
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canSelfPost && (
            <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/60 inline-flex items-center gap-1">
              <Check className="w-3 h-3 text-emerald-500" /> Self-Posting
            </span>
          )}
          {(isAdmin || user?.role === 'admin') && hasAssignedAdmin && (
            <span className="text-[11px] font-medium text-surface-600 dark:text-surface-400 bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded-md">
              Approver: {adminData.admin.name}
            </span>
          )}

          {weekStatus !== 'draft' && (
            <span className={`badge-${weekStatus}`}>
              {weekStatus === 'approved' && <Check className="w-3 h-3 mr-1" />}
              {weekStatus === 'recalled' && <RotateCcw className="w-3 h-3 mr-1" />}
              {weekStatus.charAt(0).toUpperCase() + weekStatus.slice(1)}
            </span>
          )}

          {isEditable && (
            <button onClick={() => { resetRowForm(); setShowAddRow(true); }} className="btn-secondary btn-sm">
              <Plus className="w-4 h-4" />
              Add Project
            </button>
          )}
          {isEditable && (
            <button onClick={() => handleSave(false)} disabled={saving} className="btn-secondary btn-sm">
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}

          {/* If admin can self-post, show Post Timesheet button */}
          {canSelfPost && (hasDrafts || hasSubmitted) && (
            <button
              onClick={handlePost}
              disabled={saving}
              className="btn-primary btn-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              title="Post and approve your timesheet directly (no admin assigned to you)"
            >
              <Send className="w-4 h-4" />
              Post Timesheet
            </button>
          )}

          {/* Normal submit week button for employees or admins with an assigned admin */}
          {!canSelfPost && hasDrafts && (
            <button onClick={handleSubmit} className="btn-primary btn-sm">
              <Send className="w-4 h-4" />
              Submit Week
            </button>
          )}

          {/* User can recall BEFORE admin approves (while status is submitted).
              Once admin approved, recall can only be done from Admin side. */}
          {hasSubmitted && !allApproved && (
            <button
              onClick={() => setShowRecallModal(true)}
              className="btn-ghost btn-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
              title="Recall submitted timesheet to make corrections before admin approval"
              id="timesheet-recall-btn"
            >
              <RotateCcw className="w-4 h-4" />
              Recall
            </button>
          )}

          {/* Unassigned Admin can recall their own self-posted timesheet */}
          {allApproved && isAdmin && canSelfPost && (
            <button
              onClick={() => setShowRecallModal(true)}
              className="btn-ghost btn-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
              title="Recall approved timesheet for correction"
              id="timesheet-recall-admin-btn"
            >
              <RotateCcw className="w-4 h-4" />
              Recall
            </button>
          )}

          {/* User message when week is already approved */}
          {allApproved && (!isAdmin || !canSelfPost) && (
            <span
              className="text-xs text-emerald-700 dark:text-emerald-400 font-medium px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800"
              title="Timesheet is approved. If corrections are needed, please contact your admin to recall."
            >
              Approved (Admin Recall Only)
            </span>
          )}
        </div>
      </div>

      {adminComment && (
        <div className={`flex items-start gap-3 p-3 rounded-lg border ${
          weekStatus === 'rejected' 
            ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900/30' 
            : weekStatus === 'recalled'
            ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900/30'
            : 'bg-blue-50 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/30'
        }`}>
          <MessageSquare className={`w-4 h-4 mt-0.5 shrink-0 ${
            weekStatus === 'rejected' ? 'text-red-500' : weekStatus === 'recalled' ? 'text-amber-500' : 'text-blue-500'
          }`} />
          <div>
            <p className={`text-xs font-semibold ${
              weekStatus === 'rejected' ? 'text-red-700 dark:text-red-400' : 
              weekStatus === 'recalled' ? 'text-amber-700 dark:text-amber-400' :
              'text-blue-700 dark:text-blue-400'
            }`}>
              {weekStatus === 'rejected' ? 'Rejection Reason' : weekStatus === 'recalled' ? 'Recall Reason' : 'Admin Comment'}
            </p>
            <p className="text-sm text-surface-700 dark:text-surface-300 mt-0.5">{adminComment}</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-4 text-sm">
        <span className="text-surface-500 dark:text-surface-400">
          Weekly Total: <strong className="text-surface-900 dark:text-white">{getGrandTotal().toFixed(1)}h</strong>
        </span>
        <span className="text-surface-400">•</span>
        <span className="text-surface-500 dark:text-surface-400">
          {rows.length} project{rows.length !== 1 ? 's' : ''}
        </span>
        {getGrandTotal() > 0 && (
          <>
            <span className="text-surface-400">•</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              getGrandTotal() >= 40 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400' :
              getGrandTotal() >= 20 ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' :
              'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'
            }`}>
              {getGrandTotal() >= 40 ? 'Full week' : `${(getGrandTotal() / 40 * 100).toFixed(0)}% of 40h`}
            </span>
          </>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 dark:border-surface-800">
                <th className="sticky left-0 z-10 bg-white dark:bg-surface-900 text-left px-4 py-3 text-xs font-semibold text-surface-500 dark:text-surface-400 w-[280px] min-w-[280px]">
                  Hierarchy / Project
                </th>
                {days.map(d => {
                  const isHoliday = holidayDates.has(d.date);
                  const dayTotal = getDayTotal(d.date);
                  return (
                    <th
                      key={d.date}
                      className={`px-2 py-2.5 text-center min-w-[80px] w-[80px] ${
                        d.isWeekend ? 'bg-surface-50 dark:bg-surface-800/30' : ''
                      } ${isHoliday ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
                      title={isHoliday ? holidayNames[d.date] : undefined}
                    >
                      <div className="text-[11px] font-semibold text-surface-500 dark:text-surface-400">
                        {d.weekday}
                      </div>
                      <div className={`text-sm font-bold ${
                        d.isWeekend ? 'text-surface-400 dark:text-surface-600' :
                        isHoliday ? 'text-red-500' :
                        'text-surface-800 dark:text-surface-200'
                      }`}>
                        {d.month} {d.day}
                      </div>
                      {isHoliday && (
                        <div className="text-[9px] text-red-400 truncate max-w-[76px] mx-auto" title={holidayNames[d.date]}>
                          {holidayNames[d.date]}
                        </div>
                      )}
                      {dayTotal > 0 && (
                        <div className={`text-[10px] font-semibold mt-0.5 ${
                          dayTotal > 24 ? 'text-red-500' :
                          dayTotal !== 8 && !d.isWeekend && !isHoliday ? 'text-amber-500' :
                          'text-emerald-500'
                        }`}>
                          {dayTotal}h
                        </div>
                      )}
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-center min-w-[70px] text-xs font-semibold text-surface-500 dark:text-surface-400">
                  Total
                </th>
                <th className="px-2 py-2 text-center min-w-[40px]" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-16 text-sm text-surface-400">
                    <div className="flex flex-col items-center gap-2">
                      <Calendar className="w-8 h-8 text-surface-300 dark:text-surface-600" />
                      <p>No entries for Week {week}.</p>
                      <p className="text-xs">Click "Add Project" to get started.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIdx) => {
                  const rowTotal = getRowTotal(row);
                  const isLocked = row.status === 'approved' || row.status === 'submitted';

                  return (
                    <tr key={`${row.project_id || 'null'}-${row.task_id}-${row.division_id}-${row.subdivision_id}-${row.project_description}-${row.ownership_id || 0}`} className="border-b border-surface-100 dark:border-surface-800/50 group hover:bg-surface-50/50 dark:hover:bg-surface-800/20">
                      <td className="sticky left-0 z-10 bg-white dark:bg-surface-900 group-hover:bg-surface-50 dark:group-hover:bg-surface-850 px-4 py-2 transition-colors border-r border-surface-100 dark:border-surface-800/50">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-surface-900 dark:text-white truncate">
                              {row.project_id 
                                ? `${row.division_name || 'N/A'}${row.subdivision_name ? ` > ${row.subdivision_name}` : ''}`
                                : (row.classification || 'Non-Billable')
                              }
                            </span>
                            {row.status !== 'draft' && (
                              <span className={`badge-${row.status} shrink-0 text-[9px]`}>
                                {row.status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="min-w-0 flex-1">
                              {row.project_id ? (
                                <>
                                  <p className="text-xs font-bold text-brand-600 dark:text-brand-400 truncate">
                                    {row.project_code} - {row.project_name}
                                  </p>
                                  {row.project_description && (
                                    <p className="text-[11px] text-surface-600 dark:text-surface-400 truncate" title={row.project_description}>
                                      📝 {row.project_description}
                                    </p>
                                  )}
                                  {row.ownership_label && (
                                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400 truncate" title={`Ownership: ${row.ownership_label}`}>
                                      🏷️ {row.ownership_label}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 truncate">
                                  {row.task_category}{row.task_desc ? ` — ${row.task_desc}` : ''}
                                </p>
                              )}
                              {row.task_category && (
                                <p className="text-[10px] text-surface-400 truncate">
                                  Task: {row.task_category}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {days.map(d => {
                        const isHoliday = holidayDates.has(d.date);
                        const val = row.hours[d.date] || '';
                        return (
                          <td
                            key={d.date}
                            className={`px-1 py-1.5 text-center border-r border-surface-50 dark:border-surface-800/20 ${
                              d.isWeekend ? 'bg-surface-50 dark:bg-surface-800/30' : ''
                            } ${isHoliday ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                          >
                            <input
                              type="number"
                              min="0"
                              max="24"
                              step="0.5"
                              value={val}
                              onChange={(e) => updateHours(rowIdx, d.date, e.target.value)}
                              disabled={isLocked}
                              className={`w-14 h-9 text-center text-sm rounded-lg border transition-all
                                ${val > 0
                                  ? 'border-brand-200 bg-brand-50/50 text-brand-700 font-semibold dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-400'
                                  : 'border-transparent bg-transparent text-surface-400 hover:border-surface-300 dark:hover:border-surface-600'
                                }
                                focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:bg-white dark:focus:bg-surface-800
                                disabled:opacity-40 disabled:cursor-not-allowed`}
                              placeholder="—"
                            />
                          </td>
                        );
                      })}

                      <td className="px-3 py-1 text-center bg-surface-50/30 dark:bg-surface-800/10">
                        <span className={`text-sm font-bold ${
                          rowTotal > 0 ? 'text-surface-900 dark:text-white' : 'text-surface-300 dark:text-surface-600'
                        }`}>
                          {rowTotal > 0 ? `${rowTotal.toFixed(1)}` : '—'}
                        </span>
                      </td>

                      <td className="px-1 py-1 text-center">
                        <div className="flex items-center gap-0.5 justify-center opacity-0 group-hover:opacity-100 transition-all">
                          {!isLocked && (
                            <button
                              onClick={() => openEditRow(row, rowIdx)}
                              className="p-1.5 rounded-lg text-surface-300 hover:text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-950/20"
                              title="Edit row"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                          {!isLocked && (
                            <button
                              onClick={() => removeRow(rowIdx)}
                              className="p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                              title="Remove row"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}

              {rows.length > 0 && (
                <tr className="bg-surface-50 dark:bg-surface-800/30 border-t-2 border-surface-200 dark:border-surface-700">
                  <td className="sticky left-0 z-10 bg-surface-50 dark:bg-surface-800/30 px-4 py-3 text-xs font-bold text-surface-600 dark:text-surface-300 text-right">
                    Daily Totals
                  </td>
                  {days.map(d => {
                    const total = getDayTotal(d.date);
                    const isHoliday = holidayDates.has(d.date);
                    const warning = total > 0 && total !== 8 && !d.isWeekend && !isHoliday;
                    const error = total > 24;
                    return (
                      <td key={d.date} className={`px-2 py-3 text-center ${d.isWeekend ? 'bg-surface-100 dark:bg-surface-800/50' : ''}`}>
                        <span className={`text-sm font-bold ${
                          error ? 'text-red-500' :
                          warning ? 'text-amber-500' :
                          total > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                          'text-surface-300 dark:text-surface-600'
                        }`}>
                          {total > 0 ? total.toFixed(1) : '—'}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center">
                    <span className="text-base font-bold text-brand-600 dark:text-brand-400">
                      {getGrandTotal().toFixed(1)}
                    </span>
                  </td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {days.filter(d => {
            const total = getDayTotal(d.date);
            return total > 0 && total !== 8 && !d.isWeekend && !holidayDates.has(d.date);
          }).map(d => (
            <span key={d.date} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {d.weekday} {d.month} {d.day}: {getDayTotal(d.date)}h ≠ 8h
            </span>
          ))}
        </div>
      )}

      {/* Add/Edit project row modal */}
      <Modal
        isOpen={showAddRow}
        onClose={() => { 
          resetRowForm();
          setShowAddRow(false); 
        }}
        title={editingRowIdx !== null ? "Edit Row" : "Add Project Row"}
        size="lg"
        footer={
          <>
            <button onClick={() => { resetRowForm(); setShowAddRow(false); }} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleAddRow} className="btn-primary btn-sm">
              {editingRowIdx !== null ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingRowIdx !== null ? 'Update Row' : 'Add Row'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Task Category *"
            options={tasks.map(t => ({ value: t.id, label: `${t.task_category}${t.classification ? ` (${t.classification})` : ''}` }))}
            value={newRowTask}
            onChange={setNewRowTask}
            placeholder="Select a task category..."
            id="add-row-task-category"
          />

          {newRowTask && !selectedTaskRequiresProject && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/30 animate-fade-in">
              <Info className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
              <p className="text-sm text-purple-700 dark:text-purple-300">
                This category does not require a project. Hours will be logged directly under <strong>{tasks.find(t => t.id === newRowTask)?.task_category}</strong>.
              </p>
            </div>
          )}

          {selectedTaskRequiresProject && (
            <>
              <SearchableSelect
                label="Division"
                options={divisions.map(d => ({ value: d.id, label: d.name }))}
                value={newRowDivision}
                onChange={setNewRowDivision}
                placeholder="Search and select a division..."
                clearable
                id="add-row-division"
              />
              <SearchableSelect
                label="Subdivision (optional)"
                options={modalSubdivisionOptions.map(s => ({ value: s.id, label: s.name }))}
                value={newRowSubdivision}
                onChange={setNewRowSubdivision}
                placeholder={!newRowDivision ? "Select a division first..." : "Search and select a subdivision..."}
                disabled={!newRowDivision || modalSubdivisionOptions.length === 0}
                clearable
                id="add-row-subdivision"
              />
              <SearchableSelect
                label="Project Category *"
                options={modalProjectOptions.map(p => ({ value: p.id, label: `${p.project_code} — ${p.project_name}` }))}
                value={newRowProject}
                onChange={setNewRowProject}
                placeholder="Search and select a project..."
                id="add-row-project"
              />

              {newRowProject && cumulativeHoursForProject > 0 && (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 animate-fade-in">
                  <Clock className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Hours already booked for this project: <strong className="text-blue-800 dark:text-blue-200">{cumulativeHoursForProject.toFixed(1)} hrs</strong>
                    <span className="text-blue-500 dark:text-blue-400 ml-1">(this week)</span>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
                  Project Description (optional)
                </label>
                <input
                  className="input"
                  value={newRowProjectDesc}
                  onChange={(e) => setNewRowProjectDesc(e.target.value)}
                  placeholder="Specific details about this project..."
                  id="add-row-project-desc"
                />
              </div>

              {departmentOwnerships.length > 0 && (
                <SearchableSelect
                  label="Ownership (optional)"
                  options={departmentOwnerships.map(o => ({ value: o.id, label: o.label }))}
                  value={newRowOwnership}
                  onChange={setNewRowOwnership}
                  placeholder="Select ownership type..."
                  clearable
                  id="add-row-ownership"
                />
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showRecallModal}
        onClose={() => { setShowRecallModal(false); setRecallComment(''); }}
        title="Recall Timesheet"
        size="md"
        footer={
          <>
            <button onClick={() => setShowRecallModal(false)} className="btn-secondary btn-sm">Cancel</button>
            <button onClick={handleRecall} className="btn-primary btn-sm bg-amber-500 hover:bg-amber-600 border-amber-500">
              <RotateCcw className="w-4 h-4" /> Recall for Correction
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
            <Info className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Recalling will change this week's status back to draft, allowing you to make corrections and resubmit for approval.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-surface-600 dark:text-surface-400 mb-1.5">
              Reason for recall (optional)
            </label>
            <textarea
              value={recallComment}
              onChange={(e) => setRecallComment(e.target.value)}
              className="input min-h-[80px] resize-none"
              placeholder="Describe the reason for recalling this timesheet..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
