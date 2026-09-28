'use client';
// ─────────────────────────────────────────────────────────────────────────────
// क्लोजिंग सूची के लिए Search + Date/Month Range फ़िल्टर
// useClosingFilter(list, { getName, getSearchText, getDate, getStatus })
//   -> { filtered, bar }   ( bar = ऊपर रखने के लिए तैयार UI )
// ─────────────────────────────────────────────────────────────────────────────
import React, { useMemo, useState } from 'react';
import { Input, DatePicker, Segmented, Select, Button, Tag, Tooltip } from 'antd';
import { CalendarOutlined, ClearOutlined, SortAscendingOutlined, SortDescendingOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { toDay } from '@/lib/paidHistory';

const { RangePicker } = DatePicker;

const lc = (v) => String(v ?? '').toLowerCase();

const QUICK = [
  { key: 'thisMonth', label: 'इस माह', range: () => [dayjs().startOf('month'), dayjs().endOf('month')] },
  { key: 'lastMonth', label: 'पिछला माह', range: () => [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { key: 'last3', label: '3 माह', range: () => [dayjs().subtract(2, 'month').startOf('month'), dayjs().endOf('month')] },
  { key: 'thisYear', label: 'इस वर्ष', range: () => [dayjs().startOf('year'), dayjs().endOf('year')] },
];

export function useClosingFilter(list = [], {
  getSearchText = (x) => '',
  getDate = (x) => null,
  getStatus = null,             // (x) => 'pending' | 'partial' | 'paid'   (status फ़िल्टर दिखाने के लिए)
  size = 'small',
} = {}) {
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('month');   // 'month' | 'date'
  const [range, setRange] = useState(null);    // [dayjs, dayjs]
  const [status, setStatus] = useState('all');
  const [sortDir, setSortDir] = useState(null); // null = सूची क्रम, 'asc' | 'desc'

  const filtered = useMemo(() => {
    const s = lc(search).trim();
    const from = range?.[0] ? range[0].startOf(mode === 'month' ? 'month' : 'day') : null;
    const to = range?.[1] ? range[1].endOf(mode === 'month' ? 'month' : 'day') : null;

    let out = list.filter((x) => {
      if (s && !lc(getSearchText(x)).includes(s)) return false;
      if (getStatus && status !== 'all') {
        const st = getStatus(x) || 'pending';
        if (status === 'due' ? st === 'paid' : st !== status) return false;
      }
      if (from || to) {
        const d = toDay(getDate(x));
        if (!d) return false;
        if (from && d.isBefore(from)) return false;
        if (to && d.isAfter(to)) return false;
      }
      return true;
    });

    if (sortDir) {
      out = [...out].sort((a, b) => {
        const da = toDay(getDate(a)); const db = toDay(getDate(b));
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return sortDir === 'asc' ? da.valueOf() - db.valueOf() : db.valueOf() - da.valueOf();
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, search, range, mode, status, sortDir]);

  const active = !!search || !!range || status !== 'all';
  const clear = () => { setSearch(''); setRange(null); setStatus('all'); };

  const bar = (
    <div className="bg-white border border-gray-200 rounded-xl p-2 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input.Search
          size={size} allowClear placeholder="नाम, पिता, रजि. नं. या दिनांक खोजें..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1" style={{ minWidth: 180 }}
        />
        {getStatus && (
          <Select size={size} value={status} onChange={setStatus} style={{ width: 120 }}
            options={[
              { value: 'all', label: 'सभी' },
              { value: 'due', label: 'बकाया' },
              { value: 'partial', label: 'आंशिक' },
              { value: 'paid', label: 'पेड' },
            ]} />
        )}
        <Tooltip title={sortDir === 'asc' ? 'पुरानी पहले' : sortDir === 'desc' ? 'नई पहले' : 'दिनांक से क्रमबद्ध करें'}>
          <Button size={size}
            type={sortDir ? 'primary' : 'default'}
            icon={sortDir === 'asc' ? <SortAscendingOutlined /> : <SortDescendingOutlined />}
            onClick={() => setSortDir((d) => (d === null ? 'desc' : d === 'desc' ? 'asc' : null))} />
        </Tooltip>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Segmented size={size} value={mode} onChange={(v) => { setMode(v); setRange(null); }}
          options={[{ label: 'माह', value: 'month' }, { label: 'दिनांक', value: 'date' }]} />
        <RangePicker
          size={size}
          picker={mode === 'month' ? 'month' : 'date'}
          format={mode === 'month' ? 'MMM YYYY' : 'DD-MM-YYYY'}
          value={range}
          onChange={setRange}
          allowEmpty={[true, true]}
          placeholder={mode === 'month' ? ['से माह', 'तक माह'] : ['से दिनांक', 'तक दिनांक']}
          suffixIcon={<CalendarOutlined />}
          style={{ minWidth: 220 }}
        />
        <div className="flex gap-1 flex-wrap">
          {QUICK.map((q) => (
            <Tag.CheckableTag key={q.key} className="text-xs border border-gray-200 m-0"
              checked={false}
              onChange={() => { setMode('month'); setRange(q.range()); }}>
              {q.label}
            </Tag.CheckableTag>
          ))}
        </div>
        {active && (
          <Button size={size} type="link" icon={<ClearOutlined />} onClick={clear} className="p-0 h-auto text-red-500">
            साफ़ करें
          </Button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {filtered.length} / {list.length}
        </span>
      </div>
    </div>
  );

  return { filtered, bar, active, clear };
}

export default useClosingFilter;
