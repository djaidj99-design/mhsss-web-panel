'use client';
import React, { useEffect, useState } from 'react';
import { Modal, Button, Table, Tag, Alert, Switch, Tabs, Spin, Row, Col, App } from 'antd';

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

async function callApi(endpoint, options = {}) {
  const { getAuth } = await import('firebase/auth');
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Not authenticated');
  const res = await fetch(endpoint, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

const STATUS_COLOR = { paid: 'green', partial: 'gold', pending: 'orange' };
const StatusTag = ({ s }) => <Tag color={STATUS_COLOR[s] || 'default'} className="m-0">{s}</Tag>;

const personCol = (title, nameKey, regKey) => ({
  title,
  render: (_, r) => (
    <div>
      <div className="font-medium text-xs">{r[nameKey] || '—'}</div>
      <div className="text-[11px] text-gray-400">{r[regKey]}</div>
    </div>
  ),
});

/**
 * भुगतान मिलान — transactions (असली जमा) बनाम pending entries (paid/pending status)
 */
export default function ReconcileModal({ open, onClose, programId, programName, onFixed }) {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [data, setData] = useState(null);
  const [resetPaidWithoutTx, setResetPaidWithoutTx] = useState(false);

  const load = async () => {
    if (!programId) return;
    setLoading(true);
    try {
      setData(await callApi(`/api/payments/reconcile?programId=${programId}`));
    } catch (e) {
      message.error('मिलान रिपोर्ट लोड नहीं हुई: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, programId]);

  const s = data?.summary;
  const fixCount = (s?.fixCount || 0) + (resetPaidWithoutTx ? s?.paidWithoutTxCount || 0 : 0);

  const apply = () => {
    modal.confirm({
      title: 'मिलान सुधार लागू करें?',
      content: `${fixCount} पेंडिंग एंट्री का status और जमा राशि transactions के अनुसार ठीक की जाएगी। Transactions में कोई बदलाव नहीं होगा।`,
      okText: 'हाँ, लागू करें',
      cancelText: 'रद्द करें',
      onOk: async () => {
        setApplying(true);
        try {
          const r = await callApi('/api/payments/reconcile', {
            method: 'POST',
            body: JSON.stringify({ programId, resetPaidWithoutTx }),
          });
          message.success(`${r.fixed} एंट्री ठीक की गईं`);
          onFixed?.();
          await load();
        } catch (e) {
          message.error('सुधार लागू नहीं हुआ: ' + e.message);
        } finally {
          setApplying(false);
        }
      },
    });
  };

  const stat = (label, value, color) => (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  );

  const fixCols = [
    personCol('भुगतानकर्ता', 'payerName', 'payerRegNo'),
    personCol('क्लोजिंग', 'closingName', 'closingRegNo'),
    { title: 'देय', dataIndex: 'due', width: 70, render: fmt },
    { title: 'अभी', width: 110, render: (_, r) => <span><StatusTag s={r.oldStatus} /> {fmt(r.oldPaid)}</span> },
    { title: 'सही', width: 110, render: (_, r) => <span><StatusTag s={r.newStatus} /> {fmt(r.newPaid)}</span> },
  ];

  const orphanCols = [
    { title: 'TRX', dataIndex: 'transactionNumber', width: 150, render: v => <span className="text-[11px] font-mono">{v}</span> },
    personCol('भुगतानकर्ता', 'payerName', 'payerRegNo'),
    personCol('क्लोजिंग', 'closingName', 'closingRegNo'),
    { title: 'राशि', dataIndex: 'amount', width: 80, render: fmt },
    { title: 'तारीख', dataIndex: 'paymentDate', width: 95, render: v => v ? String(v).slice(0, 10) : '' },
  ];

  const overCols = [
    personCol('भुगतानकर्ता', 'payerName', 'payerRegNo'),
    personCol('क्लोजिंग', 'closingName', 'closingRegNo'),
    { title: 'देय', dataIndex: 'due', width: 70, render: fmt },
    { title: 'जमा (TRX)', dataIndex: 'txPaid', width: 90, render: fmt },
    { title: 'ज़्यादा', dataIndex: 'extra', width: 80, render: v => <span className="text-red-500">{fmt(v)}</span> },
  ];

  const noTxCols = [
    personCol('भुगतानकर्ता', 'payerName', 'payerRegNo'),
    personCol('क्लोजिंग', 'closingName', 'closingRegNo'),
    { title: 'अभी', width: 110, render: (_, r) => <span><StatusTag s={r.oldStatus} /> {fmt(r.oldPaid)}</span> },
    { title: 'TRX में', dataIndex: 'txPaid', width: 80, render: fmt },
    { title: 'बिना TRX', dataIndex: 'missing', width: 80, render: v => <span className="text-orange-500">{fmt(v)}</span> },
  ];

  const table = (cols, rows, rowKey) => (
    <Table size="small" columns={cols} dataSource={rows || []} rowKey={rowKey}
      pagination={{ pageSize: 8, size: 'small' }} scroll={{ x: 600 }} />
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={960}
      title={`भुगतान मिलान (Reconcile) ${programName ? '— ' + programName : ''}`}
      destroyOnHidden
      footer={[
        <Button key="r" onClick={load} disabled={loading || applying}>दोबारा जाँचें</Button>,
        <Button key="c" onClick={onClose}>बंद करें</Button>,
        <Button key="a" type="primary" className="bg-blue-600" loading={applying}
          disabled={loading || !fixCount} onClick={apply}>
          {fixCount} एंट्री ठीक करें
        </Button>,
      ]}
    >
      <Spin spinning={loading}>
        {s && (
          <>
            <Alert type="info" showIcon className="mb-3"
              message="Transactions = असली जमा पैसा। हर पेंडिंग एंट्री का status और जमा राशि उसके transactions के जोड़ से ठीक की जाती है। Transactions कभी नहीं बदले जाते।" />

            <Row gutter={[8, 8]} className="mb-3">
              <Col xs={12} md={6}>{stat('कुल जमा (Transactions)', fmt(s.totalTxAmount), '#059669')}</Col>
              <Col xs={12} md={6}>{stat('एंट्री में जमा — अभी', fmt(s.entryPaidBefore), '#b45309')}</Col>
              <Col xs={12} md={6}>{stat('एंट्री में जमा — सुधार के बाद', fmt(s.entryPaidAfter), '#2563eb')}</Col>
              <Col xs={12} md={6}>{stat('बिना एंट्री वाले TRX', `${s.orphanTxCount} · ${fmt(s.orphanTxAmount)}`, '#dc2626')}</Col>
            </Row>

            {s.fixCount === 0 && s.orphanTxCount === 0 && s.paidWithoutTxCount === 0 && (
              <Alert type="success" showIcon className="mb-3" message="सब कुछ मिलान में है — कोई सुधार ज़रूरी नहीं।" />
            )}

            <Tabs
              size="small"
              items={[
                {
                  key: 'fix',
                  label: <span>ठीक होंगी <Tag color="blue">{s.fixCount}</Tag></span>,
                  children: table(fixCols, data.fixes, 'entryId'),
                },
                {
                  key: 'orphan',
                  label: <span>बिना एंट्री वाले TRX <Tag color="red">{s.orphanTxCount}</Tag></span>,
                  children: (
                    <>
                      <Alert type="warning" showIcon className="mb-2"
                        message="इन transactions की कोई पेंडिंग एंट्री नहीं है (क्लोजिंग revert/delete हुई, या सदस्य उस क्लोजिंग के लिए पात्र नहीं था)। इन्हें हाथ से देखें — ज़रूरत हो तो Transactions पेज से delete करें या सही क्लोजिंग पर दोबारा दर्ज करें।" />
                      {table(orphanCols, data.orphanTx, 'txId')}
                    </>
                  ),
                },
                {
                  key: 'over',
                  label: <span>ज़्यादा जमा <Tag color="volcano">{s.overpaidCount}</Tag></span>,
                  children: (
                    <>
                      <Alert type="warning" showIcon className="mb-2"
                        message="एक ही क्लोजिंग के लिए देय से ज़्यादा पैसा दर्ज है — अक्सर duplicate transaction। Transactions पेज से अतिरिक्त entry हटाएँ।" />
                      {table(overCols, data.overpaid, 'entryId')}
                    </>
                  ),
                },
                {
                  key: 'notx',
                  label: <span>जमा पर TRX कम <Tag>{s.paidWithoutTxCount}</Tag></span>,
                  children: (
                    <>
                      <div className="flex items-center gap-2 mb-2 text-xs">
                        <Switch size="small" checked={resetPaidWithoutTx} onChange={setResetPaidWithoutTx} />
                        इन्हें भी transactions के बराबर करें (पुराना/माइग्रेटेड डेटा हो तो बंद ही रखें)
                      </div>
                      {table(noTxCols, data.paidWithoutTx, 'entryId')}
                    </>
                  ),
                },
              ]}
            />
          </>
        )}
      </Spin>
    </Modal>
  );
}
