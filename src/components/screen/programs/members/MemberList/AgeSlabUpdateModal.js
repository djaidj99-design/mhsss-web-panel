'use client'
import React, { useMemo, useState } from 'react';
import { Modal, Table, Tag, Switch, Alert, Button, Avatar, message } from 'antd';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { db } from '@/lib/firebase';

dayjs.extend(customParseFormat);

/**
 * आयु अनुसार किश्त स्लैब (Auto Upgrade Logic)
 *  • 15 वर्ष से कम      : ₹0
 *  • 15 से 17 वर्ष      : ₹200
 *  • 17 वर्ष से अधिक    : ₹300  (17वां जन्मदिन पूरा होते ही)
 * स्लैब बदलने हों तो सिर्फ ये array बदलें.
 */
export const AGE_SLABS = [
    { minAge: 0,  maxAge: 15,       amount: 0,   label: '15 वर्ष से कम' },
    { minAge: 15, maxAge: 17,       amount: 200, label: '15 से 17 वर्ष' },
    { minAge: 17, maxAge: Infinity, amount: 300, label: '17 वर्ष से अधिक' },
];

const DOB_FORMATS = ['DD-MM-YYYY', 'DD/MM/YYYY', 'D-M-YYYY', 'D/M/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY'];

/** bobDate (string / Timestamp / Date) -> dayjs | null */
export const parseDob = (value) => {
    if (!value) return null;
    if (typeof value?.toDate === 'function') return dayjs(value.toDate());
    if (value instanceof Date) return dayjs(value);
    if (typeof value === 'string') {
        const d = dayjs(value.trim(), DOB_FORMATS, true);
        return d.isValid() ? d : null;
    }
    return null;
};

/** आज की तारीख पर दशमलव आयु */
export const getAgeOn = (dob, onDate = dayjs()) => onDate.diff(dob, 'year', true);

export const getSlabForAge = (age) =>
    AGE_SLABS.find(s => age >= s.minAge && age < s.maxAge) || null;

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const AgeSlabUpdateModal = ({ open, onClose, members = [], userId, programId, onSuccess }) => {
    const [includeDecrease, setIncludeDecrease] = useState(false);
    const [saving, setSaving] = useState(false);

    // ── preview: kis member ka amount badlega ──────────────────────────────
    const { changes, noDob, unchanged } = useMemo(() => {
        const changes = [];
        const noDob = [];
        let unchanged = 0;

        for (const m of members) {
            if (m?.delete_flag === true) continue;
            // Closed (marriage ho chuki) members ki future kist nahi banti -> skip
            if (m?.marriage_flag === true || m?.status === 'closed') continue;

            const dob = parseDob(m?.bobDate);
            if (!dob) { noDob.push(m); continue; }

            const age = getAgeOn(dob);
            const slab = getSlabForAge(age);
            if (!slab) { noDob.push(m); continue; }

            const oldAmount = Number(m?.payAmount ?? 0) || 0;
            if (oldAmount === slab.amount) { unchanged++; continue; }

            changes.push({
                key: m.id,
                id: m.id,
                displayName: m.displayName,
                registrationNumber: m.registrationNumber,
                photoURL: m.photoURL,
                bobDate: dob.format('DD-MM-YYYY'),
                age: Math.floor(age),
                slab,
                oldAmount,
                newAmount: slab.amount,
                direction: slab.amount > oldAmount ? 'up' : 'down',
            });
        }
        return { changes, noDob, unchanged };
    }, [members]);

    const toUpdate = useMemo(
        () => changes.filter(c => includeDecrease || c.direction === 'up'),
        [changes, includeDecrease]
    );
    const decreaseCount = changes.filter(c => c.direction === 'down').length;

    // ── save: Firestore batch update ───────────────────────────────────────
    const handleUpdate = async () => {
        if (!userId || !programId || toUpdate.length === 0) return;
        setSaving(true);
        try {
            const basePath = `users/${userId}/programs/${programId}/members`;
            for (let i = 0; i < toUpdate.length; i += 450) {
                const batch = writeBatch(db);
                toUpdate.slice(i, i + 450).forEach(c => {
                    batch.update(doc(db, basePath, c.id), {
                        payAmount: c.newAmount,
                        ageSlab: c.slab.label,
                        ageSlabPrevAmount: c.oldAmount,
                        ageSlabUpdatedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    });
                });
                await batch.commit();
            }
            message.success(`${toUpdate.length} सदस्यों की किश्त राशि अपडेट हो गई`);
            onSuccess?.();
            onClose?.();
        } catch (e) {
            console.error('Age slab update failed:', e);
            message.error('किश्त अपडेट करने में त्रुटि: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            title: 'सदस्य', dataIndex: 'displayName',
            render: (_, r) => (
                <div className="flex items-center gap-2">
                    <Avatar size="small" src={r.photoURL}>{r.displayName?.[0]}</Avatar>
                    <div>
                        <div className="font-medium">{r.displayName}</div>
                        <div className="text-xs text-gray-500">{r.registrationNumber}</div>
                    </div>
                </div>
            ),
        },
        { title: 'जन्म तिथि', dataIndex: 'bobDate', width: 110 },
        {
            title: 'आयु', dataIndex: 'age', width: 70,
            sorter: (a, b) => a.age - b.age,
            render: v => `${v} वर्ष`,
        },
        {
            title: 'पुरानी → नई किश्त', width: 170,
            sorter: (a, b) => a.newAmount - b.newAmount,
            render: (_, r) => (
                <span>
                    <span className="text-gray-500 line-through mr-1">{fmt(r.oldAmount)}</span>
                    →{' '}
                    <Tag color={r.direction === 'up' ? 'green' : 'orange'} className="m-0">{fmt(r.newAmount)}</Tag>
                </span>
            ),
        },
        {
            title: 'स्थिति', width: 110,
            render: (_, r) => (r.direction === 'down' && !includeDecrease)
                ? <Tag>छोड़ा जाएगा</Tag>
                : <Tag color="blue">अपडेट होगा</Tag>,
        },
    ];

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={820}
            title="आयु अनुसार किश्त अपडेट (Auto Upgrade)"
            destroyOnHidden
            footer={[
                <Button key="cancel" onClick={onClose}>रद्द करें</Button>,
                <Button
                    key="ok" type="primary" loading={saving}
                    disabled={toUpdate.length === 0}
                    onClick={handleUpdate}
                    className="bg-blue-600"
                >
                    {toUpdate.length} सदस्य अपडेट करें
                </Button>,
            ]}
        >
            <div className="flex flex-wrap gap-2 mb-3">
                {AGE_SLABS.map(s => (
                    <Tag key={s.label} color="geekblue" className="text-sm py-0.5">
                        {s.label}: {fmt(s.amount)}
                    </Tag>
                ))}
            </div>

            <Alert
                type="info" showIcon className="mb-3"
                message="आज की आयु (जन्म तिथि से) के अनुसार सदस्य की किश्त राशि बदली जाएगी। नई राशि सिर्फ आगामी क्लोजिंग पर लागू होगी — पहले से बनी पेंडिंग/पेड एंट्री नहीं बदलेगी।"
            />

            <div className="flex flex-wrap items-center gap-3 mb-3 text-sm">
                <Tag color="green">बढ़ेगी: {changes.length - decreaseCount}</Tag>
                <Tag color="orange">घटेगी: {decreaseCount}</Tag>
                <Tag>सही है: {unchanged}</Tag>
                <Tag color="red">जन्म तिथि नहीं/गलत: {noDob.length}</Tag>
                {decreaseCount > 0 && (
                    <span className="flex items-center gap-2 ml-auto">
                        <Switch size="small" checked={includeDecrease} onChange={setIncludeDecrease} />
                        घटने वाली राशि भी अपडेट करें
                    </span>
                )}
            </div>

            <Table
                size="small"
                columns={columns}
                dataSource={changes}
                pagination={{ pageSize: 8, size: 'small' }}
                locale={{ emptyText: 'सभी सदस्यों की किश्त पहले से सही है' }}
                scroll={{ x: 600 }}
            />

            {noDob.length > 0 && (
                <div className="text-xs text-gray-500 mt-2">
                    बिना सही जन्म तिथि वाले सदस्य (नहीं बदले जाएंगे):{' '}
                    {noDob.slice(0, 15).map(m => m.registrationNumber || m.displayName).join(', ')}
                    {noDob.length > 15 && ` और ${noDob.length - 15}`}
                </div>
            )}
        </Modal>
    );
};

export default AgeSlabUpdateModal;
