import React, { useEffect, useState } from 'react'
import {
    App, Drawer, Select, Space, Divider, Typography, Button, Spin, Tag,
    Badge, Progress, Segmented, Switch, Alert,
} from 'antd'
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    FileOutlined,
    FileDoneOutlined,
    InfoCircleOutlined,
    BoldOutlined,
    PlusOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    WarningOutlined,
    ReloadOutlined,
    TeamOutlined,
} from '@ant-design/icons'
import { useSelector } from 'react-redux'
import { getData } from '@/lib/services/firebaseService'
import {
    collection, addDoc, getDocs, updateDoc, deleteDoc,
    doc, onSnapshot, query, orderBy, where, writeBatch
} from 'firebase/firestore'
import dayjs from 'dayjs'
import { db } from '@/lib/firebase'

const { Option } = Select
const { Text } = Typography

/* ─── Design tokens ──────────────────────────────────────────────────── */
const t = {
    green:  { bg: '#f6ffed', border: '#b7eb8f', text: '#389e0d' },
    amber:  { bg: '#fffbe6', border: '#ffe58f', text: '#d46b08' },
    blue:   { bg: '#e6f4ff', border: '#91caff', text: '#0958d9' },
    red:    { bg: '#fff1f0', border: '#ffa39e', text: '#cf1322' },
    gray:   { bg: '#fafafa', border: '#d9d9d9', text: '#595959' },
}

const styles = {
    /* layout */
    content: { padding: '20px 24px 8px' },

    /* section labels */
    sectionLabel: {
        fontSize: 11, fontWeight: 600, letterSpacing: '0.07em',
        textTransform: 'uppercase', color: '#8c8c8c',
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 8,
    },
    sectionHeader: {
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 8,
    },

    /* member count pill */
    countPill: {
        fontSize: 11, padding: '2px 8px', borderRadius: 999,
        background: '#f5f5f5', border: '0.5px solid #e0e0e0',
        color: '#595959', fontWeight: 500,
    },

    /* closing member cards */
    closingCard: (state) => ({
        background: state === 'done' ? t.green.bg : state === 'partial' ? t.amber.bg : '#fafafa',
        border: `0.5px solid ${state === 'done' ? t.green.border : state === 'partial' ? t.amber.border : '#e0e0e0'}`,
        borderLeft: `3px solid ${state === 'done' ? t.green.text : state === 'partial' ? t.amber.text : '#d9d9d9'}`,
        borderRadius: 10, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 14,
        marginBottom: 8,
    }),
    avatar: (color) => ({
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 600,
        background: color === 'teal' ? '#e1f5ee' : color === 'amber' ? '#faeeda' : '#f1efe8',
        color:      color === 'teal' ? '#0f6e56' : color === 'amber' ? '#854f0b' : '#5f5e5a',
    }),
    cardInfo: { flex: 1, minWidth: 0 },
    cardName: { fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    cardMeta: { fontSize: 12, color: '#8c8c8c', marginTop: 2 },
    cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 },

    /* stat grid */
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, margin: '16px 0' },
    statCard: { background: '#fafafa', borderRadius: 8, padding: '12px 14px' },
    statLabel: { fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8c8c8c', marginBottom: 4 },
    statValue: (color) => ({ fontSize: 24, fontWeight: 500, lineHeight: 1, color: color || 'inherit' }),

    /* info box */
    infoBox: {
        background: t.blue.bg, border: `0.5px solid ${t.blue.border}`,
        borderRadius: 8, padding: '14px 16px', margin: '16px 0',
    },
    infoBoxTitle: { fontSize: 13, fontWeight: 600, color: t.blue.text, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 },
    infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 8 },
    infoItem: { fontSize: 13, color: '#595959' },
    skipItem: { fontSize: 12, color: '#8c8c8c', display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 3 },

    /* result chips */
    resultsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, margin: '10px 0 4px' },
    chip: (color) => ({
        background: t[color].bg, borderRadius: 8, padding: '10px 0',
        textAlign: 'center',
    }),
    chipVal: (color) => ({ fontSize: 20, fontWeight: 500, color: t[color].text, lineHeight: 1 }),
    chipLbl: (color) => ({ fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: t[color].text, marginTop: 3 }),

    /* footer */
    footer: {
        padding: '14px 24px', borderTop: '0.5px solid #f0f0f0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    },
    pendingBadge: {
        fontSize: 11, padding: '2px 8px', borderRadius: 999,
        background: t.amber.bg, color: t.amber.text, fontWeight: 600, marginLeft: 6,
    },
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const initials = (name = '') =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')

const avatarColor = (i) => ['teal', 'amber', 'gray'][i % 3]

// Firestore hard-caps a batch at 500 ops; stay under it with headroom.
const BATCH_LIMIT = 400

const parseDDMMYYYY = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null
    const parts = dateStr.split('-')
    if (parts.length !== 3) return null
    const [day, month, year] = parts.map(Number)
    if (!day || !month || !year) return null
    return new Date(year, month - 1, day)
}

/* ─── Component ──────────────────────────────────────────────────────── */
const GenerateRasidEntry = ({ open, setOpen, selectedProgram, user, closingMemberList }) => {
    // Context-aware message/modal instead of the static antd functions —
    // the static ones can't read theme/context and warn in antd v5.
    // The <App> provider lives in src/app/layout.js.
    const { modal, message } = App.useApp()

    const [isLoading, setIsLoading] = useState(false)
    const [isGenerating, setIsGenerating] = useState(false)
    const [isChecking, setIsChecking] = useState(false)
    const [allMembersData, setAllMembersData] = useState([])
    const [selectedClosingMembers, setSelectedClosingMembers] = useState([])
    const [selectedMembers, setSelectedMembers] = useState([])
    const [existingPaymentsMap, setExistingPaymentsMap] = useState(new Map())
    const [paymentGenerationStatus, setPaymentGenerationStatus] = useState({})
    const [closingMembersStatus, setClosingMembersStatus] = useState(new Map())
    const [closingGroups, setClosingGroups] = useState([])
    const [selectedGroupIds, setSelectedGroupIds] = useState([])

    /* agent filter for the payer list — null means "all agents" */
    const agentsList = useSelector((state) => state.data.agentsList) || []
    const [agentFilter, setAgentFilter] = useState(null)

    /* mode + delete options + shared progress */
    const [mode, setMode] = useState('generate')        // 'generate' | 'delete' | 'cleanup'
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteScope, setDeleteScope] = useState('all')   // 'all' | 'selected'
    const [includePaid, setIncludePaid] = useState(false)
    const [progress, setProgress] = useState(null)      // { done, total, label }

    /* cleanup scan */
    const [isScanning, setIsScanning] = useState(false)
    const [scanResult, setScanResult] = useState(null)

    const isBusy = isGenerating || isDeleting || isScanning

    /* fetch closing groups */
    const fetchClosingGroups = async () => {
        if (!user || !selectedProgram) return;
        try {
            const snap = await getDocs(
                collection(db, `users/${user.uid}/programs/${selectedProgram.id}/closing_groups`)
            );
            setClosingGroups(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error(e); }
    };

    /* fetch members */
    const fetchAllMembers = async () => {
        if (!selectedProgram) return
        setIsLoading(true)
        try {
            const data = await getData(
                `/users/${user.uid}/programs/${selectedProgram.id}/members`,
                [{ field: 'delete_flag', operator: '==', value: false }],
                { field: 'createdAt', direction: 'desc' }
            )
            setAllMembersData(data)
        } catch (e) {
            console.error(e)
            message.error('Failed to fetch members')
        } finally {
            setIsLoading(false)
        }
    }

    /* ── Check existing payments ───────────────────────────────────────────
     * Previously this fired ONE getDocs per (closing member × member) pair,
     * sequentially — 5 closing members × 500 members = 2500 round-trips, which
     * is why the drawer hung on multi-select.
     *
     * Now it runs ONE query per closing member (`closingMemberId == id`), all in
     * parallel, and matches locally. 5 closing members = 5 round-trips.
     */
    const checkExistingPayments = async () => {
        if (!selectedClosingMembers.length) {
            setExistingPaymentsMap(new Map())
            setClosingMembersStatus(new Map())
            return
        }

        setIsChecking(true)
        const paymentsRef = collection(db, `users/${user.uid}/programs/${selectedProgram.id}/payment_pending`)

        try {
            const snaps = await Promise.all(
                selectedClosingMembers.map(id =>
                    getDocs(query(paymentsRef, where('closingMemberId', '==', id)))
                )
            )

            const existingMap = new Map()
            const closingStatus = new Map()

            selectedClosingMembers.forEach((closingId, i) => {
                // Every entry that already exists for this closing member
                const allDocs = snaps[i].docs.map(d => ({ docId: d.id, ...d.data() }))

                const byMember = new Map()
                allDocs.forEach(d => {
                    byMember.set(d.memberId, d)
                    existingMap.set(`${closingId}_${d.memberId}`, d)
                })

                // Progress is measured against the currently selected members
                const memberStatus = new Map()
                let generated = 0
                selectedMembers.forEach(mid => {
                    const hit = byMember.get(mid)
                    if (hit) { generated++; memberStatus.set(mid, { exists: true, data: hit }) }
                    else memberStatus.set(mid, { exists: false })
                })

                const total = selectedMembers.length
                closingStatus.set(closingId, {
                    total,
                    generated,
                    percentage: total ? (generated / total) * 100 : 0,
                    memberStatus,
                    allDocs,                                   // used by the delete flow
                    paidCount: allDocs.filter(d => d.status === 'paid').length,
                    pendingCount: allDocs.filter(d => d.status !== 'paid').length,
                })
            })

            setExistingPaymentsMap(existingMap)
            setClosingMembersStatus(closingStatus)
        } catch (e) {
            console.error(e)
            message.error('Failed to check existing payments')
        } finally {
            setIsChecking(false)
        }
    }

    /* ── Evaluate one (closing member, paying member) pair ──────────────────
     * Pure + synchronous. The existence check now uses the prefetched set
     * instead of a Firestore read per pair, so generating N entries costs N
     * writes and ZERO extra reads.
     */
    const evaluatePair = (closingMember, payingMember, existsSet) => {
        const paymentId = `${closingMember.id}_${payingMember.id}`

        if (closingMember.id === payingMember.id)
            return { skip: 'same_member', id: paymentId }
        if (payingMember.status === 'blocked' || payingMember.active_flag === false)
            return { skip: 'member_inactive', id: paymentId }
        if (existsSet.has(paymentId))
            return { skip: 'exists', id: paymentId }

        const marriageDate = closingMember.marriage_date || closingMember.closing_date
        const joinDate = payingMember.dateJoin || payingMember.createdAt

        if (joinDate && marriageDate) {
            const j = parseDDMMYYYY(joinDate)
            const m = parseDDMMYYYY(marriageDate)
            if (j && m && j > m) return { skip: 'joined_after_marriage', id: paymentId }
        }
        if (payingMember.marriage_flag === true) {
            const ocd = parseDDMMYYYY(payingMember.marriage_date || payingMember.closing_date)
            const cmd = parseDDMMYYYY(marriageDate)
            if (ocd && cmd && ocd.getTime() <= cmd.getTime())
                return { skip: 'already_closed', id: paymentId }
        }

        const payAmount = payingMember?.payAmount || 200
        const paymentData = {
            closingMemberId: closingMember.id,
            closingGroupId: closingMember?.closingGroupId || '',
            memberId: payingMember.id,
            memberDetails: {
                displayName: payingMember.displayName || 'N/A',
                registrationNumber: payingMember.registrationNumber || 'N/A',
                fatherName: payingMember.fatherName || 'N/A',
                photoURL: payingMember.photoURL || '',
                phone: payingMember.phone || payingMember.phoneNo || 'N/A',
                dateJoin: payingMember.dateJoin || payingMember.createdAt || 'N/A',
                village: payingMember.village || 'N/A',
                district: payingMember.district || 'N/A',
                addedByName: payingMember.addedByName || 'N/A',
                agentId: payingMember.agentId || '',
                currentStatus: payingMember.status || 'N/A',
            },
            status: 'pending',
            payAmount,
            programId: selectedProgram.id,
            createdAt: new Date(),
            updatedAt: new Date(),
            delete_flag: false,
            dueDate: dayjs().add(30, 'days').format('DD-MM-YYYY'),
            isClosingMember: payingMember.id === closingMember.id,
            paymentFor: closingMember?.displayName || 'Marriage Case',
            closingRegNo: closingMember?.registrationNumber || '',
            closingFatherName: closingMember?.fatherName || '',
            closing_date: marriageDate || '',
            village: closingMember?.village || '',
            jati: closingMember?.jati || '',
            phone: closingMember?.phone || '',
            notes: `Payment for ${closingMember?.displayName}'s marriage`,
            paymentType: 'contribution',
        }

        return { id: paymentId, data: paymentData }
    }

    /* ── Generate all ───────────────────────────────────────────────────────
     * Writes go out in fixed-size batches. The previous version reused the same
     * WriteBatch after committing it, which Firestore rejects — so any run of
     * more than 500 writes failed outright. Each chunk now gets a fresh batch.
     */
    const runGeneration = async (closingIds) => {
        if (!closingIds.length) { message.warning('Select at least one closing member'); return }
        if (!selectedMembers.length) { message.warning('Select at least one member'); return }

        const closingMembers = closingMemberList.filter(m => closingIds.includes(m.id))
        const payingMembers = allMembersData.filter(m => selectedMembers.includes(m.id))
        const paymentsRef = collection(db, `users/${user.uid}/programs/${selectedProgram.id}/payment_pending`)

        // Existence set built from the already-loaded status — no extra reads
        const existsSet = new Set(existingPaymentsMap.keys())

        // 1. Decide everything up-front (pure, instant)
        const toWrite = []
        const statusUpdates = {}
        let skipped = 0

        for (const closingMember of closingMembers) {
            for (const payingMember of payingMembers) {
                const key = `${closingMember.id}_${payingMember.id}`
                const res = evaluatePair(closingMember, payingMember, existsSet)
                if (res.skip) {
                    skipped++
                    statusUpdates[key] = {
                        status: res.skip === 'exists' ? 'exists' : 'skipped',
                        reason: res.skip,
                    }
                    continue
                }
                toWrite.push(res)
                statusUpdates[key] = { status: 'generated', id: res.id }
            }
        }

        if (toWrite.length === 0) {
            setPaymentGenerationStatus(statusUpdates)
            message.info(`Nothing to generate — ${skipped} pair(s) skipped or already exist`)
            return
        }

        // 2. Write in batches, reporting progress as each chunk lands
        setIsGenerating(true)
        setProgress({ done: 0, total: toWrite.length, label: 'Generating entries' })

        let written = 0
        try {
            for (let i = 0; i < toWrite.length; i += BATCH_LIMIT) {
                const chunk = toWrite.slice(i, i + BATCH_LIMIT)
                const batch = writeBatch(db)          // fresh batch every chunk
                chunk.forEach(({ id, data }) => batch.set(doc(paymentsRef, id), data))
                await batch.commit()
                written += chunk.length
                setProgress({ done: written, total: toWrite.length, label: 'Generating entries' })
            }

            setPaymentGenerationStatus(statusUpdates)
            message.success(`Generated ${written} entries · ${skipped} skipped`, 5)
            await checkExistingPayments()
        } catch (e) {
            console.error(e)
            message.error(`Failed after ${written} of ${toWrite.length} entries: ${e.message}`)
        } finally {
            setIsGenerating(false)
            setProgress(null)
        }
    }

    const handleGeneratePayments = () => runGeneration(selectedClosingMembers)

    const handleGenerateForClosingMember = (closingMemberId) => runGeneration([closingMemberId])

    /* ── Delete ─────────────────────────────────────────────────────────────
     * Which entries a delete would touch, given the current options.
     * `all`      → every entry belonging to the selected closing members
     * `selected` → only entries for the members picked in the second box
     * Paid entries are excluded unless the user explicitly opts in.
     */
    const collectDeleteTargets = (closingIds = selectedClosingMembers) => {
        const targets = []
        let protectedPaid = 0

        closingIds.forEach(cid => {
            const st = closingMembersStatus.get(cid)
            if (!st?.allDocs) return
            st.allDocs.forEach(d => {
                if (deleteScope === 'selected' && !selectedMembers.includes(d.memberId)) return
                if (d.status === 'paid' && !includePaid) { protectedPaid++; return }
                targets.push({ docId: d.docId, closingId: cid, status: d.status })
            })
        })

        return { targets, protectedPaid }
    }

    const runDelete = async (closingIds) => {
        const { targets, protectedPaid } = collectDeleteTargets(closingIds)

        if (targets.length === 0) {
            message.info(
                protectedPaid > 0
                    ? `Nothing to delete — ${protectedPaid} paid entry(s) are protected`
                    : 'No entries match the current selection'
            )
            return
        }

        const paidBeingDeleted = targets.filter(t => t.status === 'paid').length

        modal.confirm({
            title: `Delete ${targets.length} payment entr${targets.length === 1 ? 'y' : 'ies'}?`,
            icon: <ExclamationCircleOutlined style={{ color: t.red.text }} />,
            width: 460,
            content: (
                <div style={{ fontSize: 13 }}>
                    <p style={{ marginBottom: 8 }}>
                        This permanently removes the entries from <strong>payment_pending</strong>.
                        They can be re-created later with Generate.
                    </p>
                    <ul style={{ paddingLeft: 18, margin: 0 }}>
                        <li>Closing members: <strong>{closingIds.length}</strong></li>
                        <li>
                            Scope:{' '}
                            <strong>{deleteScope === 'all' ? 'all entries' : `${selectedMembers.length} selected member(s)`}</strong>
                        </li>
                        {protectedPaid > 0 && (
                            <li style={{ color: t.green.text }}>
                                {protectedPaid} paid entry(s) will be <strong>kept</strong>
                            </li>
                        )}
                        {paidBeingDeleted > 0 && (
                            <li style={{ color: t.red.text }}>
                                <strong>{paidBeingDeleted} PAID entr{paidBeingDeleted === 1 ? 'y' : 'ies'} will be deleted</strong> — collected
                                money records will be lost
                            </li>
                        )}
                    </ul>
                </div>
            ),
            okText: `Delete ${targets.length}`,
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: async () => {
                setIsDeleting(true)
                setProgress({ done: 0, total: targets.length, label: 'Deleting entries' })

                const paymentsRef = collection(db, `users/${user.uid}/programs/${selectedProgram.id}/payment_pending`)
                let removed = 0

                try {
                    for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
                        const chunk = targets.slice(i, i + BATCH_LIMIT)
                        const batch = writeBatch(db)
                        chunk.forEach(({ docId }) => batch.delete(doc(paymentsRef, docId)))
                        await batch.commit()
                        removed += chunk.length
                        setProgress({ done: removed, total: targets.length, label: 'Deleting entries' })
                    }

                    setPaymentGenerationStatus({})
                    message.success(`Deleted ${removed} entr${removed === 1 ? 'y' : 'ies'}`, 4)
                    await checkExistingPayments()
                } catch (e) {
                    console.error(e)
                    message.error(`Failed after deleting ${removed} of ${targets.length}: ${e.message}`)
                } finally {
                    setIsDeleting(false)
                    setProgress(null)
                }
            },
        })
    }

    const handleDeletePayments = () => runDelete(selectedClosingMembers)

    const handleDeleteForClosingMember = (closingMemberId) => runDelete([closingMemberId])

    /* ── Cleanup scanner ────────────────────────────────────────────────────
     * Walks the whole payment_pending collection once and buckets everything
     * that shouldn't be there:
     *
     *   duplicate       more than one doc for the same closing+member pair
     *                   (happens when an entry was written with a random ID
     *                   instead of the deterministic `closingId_memberId`)
     *   noClosing       closingMemberId missing/empty — not linked to anyone
     *   unknownClosing  closingMemberId points at a member that no longer exists
     *   notClosedMember closing member exists but is not actually closed
     *   unknownMember   payer missing or no longer exists
     *   selfPayment     member paying for their own closing
     */
    const ISSUE_META = {
        duplicate:       { label: 'Duplicate entries',        hint: 'Same closing member + same payer, more than one document' },
        noClosing:       { label: 'Not linked to a closing',  hint: 'closingMemberId is missing or empty' },
        unknownClosing:  { label: 'Unknown closing member',   hint: 'Closing member no longer exists in this program' },
        notClosedMember: { label: 'Closing member not closed', hint: 'Linked member exists but marriage_flag is not set' },
        unknownMember:   { label: 'Unknown payer',            hint: 'Paying member missing or no longer exists' },
        selfPayment:     { label: 'Self payment',             hint: 'Member is paying for their own closing' },
    }

    const scanPaymentIssues = async () => {
        if (!user?.uid || !selectedProgram?.id) return

        setIsScanning(true)
        try {
            const base = `users/${user.uid}/programs/${selectedProgram.id}`

            // Every member id (no delete_flag filter — a soft-deleted member
            // still "exists", we only care about truly missing references)
            const [paymentsSnap, membersSnap] = await Promise.all([
                getDocs(collection(db, `${base}/payment_pending`)),
                getDocs(collection(db, `${base}/members`)),
            ])

            const memberMap = new Map()
            membersSnap.forEach(d => memberMap.set(d.id, d.data()))

            const all = paymentsSnap.docs.map(d => ({ docId: d.id, ...d.data() }))

            const issues = {
                duplicate: [], noClosing: [], unknownClosing: [],
                notClosedMember: [], unknownMember: [], selfPayment: [],
            }

            // ── Duplicates: group by closing+member pair ──
            const groups = new Map()
            all.forEach(p => {
                if (!p.closingMemberId || !p.memberId) return
                const key = `${p.closingMemberId}_${p.memberId}`
                if (!groups.has(key)) groups.set(key, [])
                groups.get(key).push(p)
            })

            // Which doc to KEEP in a duplicate group: a paid one first (never
            // throw away a payment record), then the deterministic-ID doc,
            // then the oldest. Everything else is surplus.
            const rank = (p, key) => (
                (p.status === 'paid' ? 4 : 0) +
                (p.docId === key ? 2 : 0)
            )
            const createdMs = (p) => {
                const c = p.createdAt
                if (!c) return Number.MAX_SAFE_INTEGER
                if (typeof c?.seconds === 'number') return c.seconds * 1000
                const d = new Date(c)
                return isNaN(d.getTime()) ? Number.MAX_SAFE_INTEGER : d.getTime()
            }

            const duplicateDocIds = new Set()
            groups.forEach((list, key) => {
                if (list.length < 2) return
                const sorted = [...list].sort(
                    (a, b) => rank(b, key) - rank(a, key) || createdMs(a) - createdMs(b)
                )
                const [keep, ...surplus] = sorted
                surplus.forEach(p => {
                    duplicateDocIds.add(p.docId)
                    issues.duplicate.push({ ...p, keptDocId: keep.docId, pairKey: key })
                })
            })

            // ── Link problems (a duplicate is already accounted for) ──
            all.forEach(p => {
                if (duplicateDocIds.has(p.docId)) return

                if (!p.closingMemberId) { issues.noClosing.push(p); return }
                if (!memberMap.has(p.closingMemberId)) { issues.unknownClosing.push(p); return }
                if (p.closingMemberId === p.memberId) { issues.selfPayment.push(p); return }
                if (!p.memberId || !memberMap.has(p.memberId)) { issues.unknownMember.push(p); return }
                if (memberMap.get(p.closingMemberId)?.marriage_flag !== true) {
                    issues.notClosedMember.push(p)
                }
            })

            setScanResult({
                scannedAt: dayjs().format('DD-MM-YYYY HH:mm'),
                totalDocs: all.length,
                issues,
                totalIssues: Object.values(issues).reduce((s, arr) => s + arr.length, 0),
            })
        } catch (e) {
            console.error(e)
            message.error('Scan failed: ' + e.message)
        } finally {
            setIsScanning(false)
        }
    }

    /* delete a set of scanned issue docs */
    const runCleanup = async (categoryKeys) => {
        if (!scanResult) return

        const picked = categoryKeys.flatMap(k => scanResult.issues[k] || [])
        const protectedPaid = picked.filter(p => p.status === 'paid' && !includePaid).length
        const targets = picked.filter(p => includePaid || p.status !== 'paid')

        if (targets.length === 0) {
            message.info(
                protectedPaid > 0
                    ? `Nothing to delete — ${protectedPaid} paid entry(s) are protected`
                    : 'No entries in that category'
            )
            return
        }

        const paidBeingDeleted = targets.filter(p => p.status === 'paid').length

        modal.confirm({
            title: `Clean up ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}?`,
            icon: <ExclamationCircleOutlined style={{ color: t.red.text }} />,
            width: 460,
            content: (
                <div style={{ fontSize: 13 }}>
                    <p style={{ marginBottom: 8 }}>Categories:</p>
                    <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>
                        {categoryKeys.map(k => (
                            <li key={k}>
                                {ISSUE_META[k].label}: <strong>{(scanResult.issues[k] || []).length}</strong>
                            </li>
                        ))}
                    </ul>
                    {protectedPaid > 0 && (
                        <div style={{ color: t.green.text }}>{protectedPaid} paid entry(s) will be kept</div>
                    )}
                    {paidBeingDeleted > 0 && (
                        <div style={{ color: t.red.text }}>
                            <strong>{paidBeingDeleted} PAID entr{paidBeingDeleted === 1 ? 'y' : 'ies'} will be deleted</strong>
                        </div>
                    )}
                </div>
            ),
            okText: `Delete ${targets.length}`,
            okButtonProps: { danger: true },
            cancelText: 'Cancel',
            onOk: async () => {
                setIsDeleting(true)
                setProgress({ done: 0, total: targets.length, label: 'Cleaning up' })
                const paymentsRef = collection(db, `users/${user.uid}/programs/${selectedProgram.id}/payment_pending`)
                let removed = 0
                try {
                    for (let i = 0; i < targets.length; i += BATCH_LIMIT) {
                        const chunk = targets.slice(i, i + BATCH_LIMIT)
                        const batch = writeBatch(db)
                        chunk.forEach(p => batch.delete(doc(paymentsRef, p.docId)))
                        await batch.commit()
                        removed += chunk.length
                        setProgress({ done: removed, total: targets.length, label: 'Cleaning up' })
                    }
                    message.success(`Cleaned up ${removed} entr${removed === 1 ? 'y' : 'ies'}`, 4)
                    await scanPaymentIssues()
                } catch (e) {
                    console.error(e)
                    message.error(`Failed after ${removed} of ${targets.length}: ${e.message}`)
                } finally {
                    setIsDeleting(false)
                    setProgress(null)
                }
            },
        })
    }

    // Runs on closing-member selection alone too, so the Delete tab can show
    // counts without forcing the user to pick individual members first.
    useEffect(() => {
        if (selectedClosingMembers.length > 0) checkExistingPayments()
        else { setClosingMembersStatus(new Map()); setExistingPaymentsMap(new Map()) }
    }, [selectedClosingMembers, selectedMembers])

    useEffect(() => {
        if (open) {
            fetchAllMembers()
            fetchClosingGroups()
            setSelectedClosingMembers([])
            setSelectedMembers([])
            setSelectedGroupIds([])
            setAgentFilter(null)
            setPaymentGenerationStatus({})
            setClosingMembersStatus(new Map())
            setMode('generate')
            setDeleteScope('all')
            setIncludePaid(false)
            setProgress(null)
            setScanResult(null)
        }
    }, [open, selectedProgram, user.uid])

    /* closing members filtered by selected groups (multi-select) */
    const filteredClosingMembers = selectedGroupIds.length > 0
        ? closingMemberList.filter(m => selectedGroupIds.includes(m.closingGroupId))
        : closingMemberList

    /* ── Bulk select helpers ──────────────────────────────────────────────
     * "Select all" respects the closing-group filter above, so it selects
     * exactly what is visible in the dropdown, not the whole database.
     */
    const allClosingSelected =
        filteredClosingMembers.length > 0 &&
        filteredClosingMembers.every(m => selectedClosingMembers.includes(m.id))

    const selectAllClosingMembers = () =>
        setSelectedClosingMembers(filteredClosingMembers.map(m => m.id))

    /* ── Agent filter for the payer list ──────────────────────────────────
     * null          → all agents (default)
     * '__none__'    → members with no agent assigned
     * <agentId>     → that agent's members only
     */
    const agentNameById = new Map(
        agentsList.map(a => [a.id, a.displayName || a.name || a.agentName || 'Unnamed agent'])
    )

    const agentOptions = (() => {
        const counts = new Map()
        let noAgent = 0
        allMembersData.forEach(m => {
            if (!m.agentId) { noAgent++; return }
            counts.set(m.agentId, (counts.get(m.agentId) || 0) + 1)
        })
        const opts = Array.from(counts.entries())
            .map(([id, count]) => ({
                value: id,
                count,
                label: `${agentNameById.get(id) || 'Unknown agent'} (${count})`,
            }))
            .sort((a, b) => a.label.localeCompare(b.label))
        if (noAgent > 0) opts.push({ value: '__none__', count: noAgent, label: `No agent (${noAgent})` })
        return opts
    })()

    const membersForSelection = agentFilter === null
        ? allMembersData
        : agentFilter === '__none__'
            ? allMembersData.filter(m => !m.agentId)
            : allMembersData.filter(m => m.agentId === agentFilter)

    // Payers: skip members that would be skipped anyway (blocked / inactive)
    const selectableMembers = membersForSelection.filter(
        m => m.status !== 'blocked' && m.active_flag !== false
    )

    /* Switching agent prunes any selection that is no longer visible, so you
     * never generate for members you can't see. */
    const handleAgentFilterChange = (val) => {
        const next = val ?? null
        setAgentFilter(next)
        const visible = new Set(
            (next === null
                ? allMembersData
                : next === '__none__'
                    ? allMembersData.filter(m => !m.agentId)
                    : allMembersData.filter(m => m.agentId === next)
            ).map(m => m.id)
        )
        setSelectedMembers(prev => prev.filter(id => visible.has(id)))
    }
    const allMembersSelected =
        selectableMembers.length > 0 &&
        selectableMembers.every(m => selectedMembers.includes(m.id))

    const selectAllMembers = () => setSelectedMembers(selectableMembers.map(m => m.id))

    /* filter function for closing member search */
    const filterClosingMember = (input, option) => {
        const m = closingMemberList.find(m => m.id === option.value)
        if (!m) return false
        const s = input.toLowerCase()
        return [m.registrationNumber, m.displayName, m.fatherName, m.phone, m.closingGroupName].some(v => v?.toLowerCase().includes(s))
    }

    const filterAllMember = (input, option) => {
        const m = allMembersData.find(m => m.id === option.value)
        if (!m) return false
        const s = input.toLowerCase()
        return [m.registrationNumber, m.displayName, m.fatherName, m.phone].some(v => v?.toLowerCase().includes(s))
    }

    /* derived counts */
    const totalCombinations = selectedClosingMembers.length * selectedMembers.length
    const totalGeneratedPayments = Array.from(closingMembersStatus.values()).reduce((s, v) => s + (v?.generated || 0), 0)
    const pendingCount = totalCombinations - totalGeneratedPayments

    /* result chip data */
    const genResults = [
        { label: 'Generated', color: 'green', count: Object.values(paymentGenerationStatus).filter(s => s.status === 'generated').length },
        { label: 'Exists',    color: 'amber', count: Object.values(paymentGenerationStatus).filter(s => s.status === 'exists').length },
        { label: 'Skipped',   color: 'blue',  count: Object.values(paymentGenerationStatus).filter(s => s.status === 'skipped').length },
        { label: 'Errors',    color: 'red',   count: Object.values(paymentGenerationStatus).filter(s => s.status === 'error').length },
    ]

    const isDeleteMode  = mode === 'delete'
    const isCleanupMode = mode === 'cleanup'

    /* how many entries a delete would remove right now */
    const deletePreview = isDeleteMode
        ? collectDeleteTargets()
        : { targets: [], protectedPaid: 0 }

    /* render closing member status cards */
    const renderClosingCards = () => {
        if (!selectedClosingMembers.length) return null
        const members = closingMemberList.filter(m => selectedClosingMembers.includes(m.id))
        return (
            <div style={{ marginBottom: 20 }}>
                <div style={styles.sectionLabel}>
                    <FileDoneOutlined /> Closing members status
                </div>
                {members.map((member, i) => {
                    const status = closingMembersStatus.get(member.id)
                    const isDone = status && status.generated === status.total && status.total > 0
                    const isPartial = status && status.generated > 0 && status.generated < status.total
                    const state = isDone ? 'done' : isPartial ? 'partial' : 'empty'
                    return (
                        <div key={member.id} style={styles.closingCard(state)}>
                            <div style={styles.avatar(avatarColor(i))}>
                                {initials(member.displayName)}
                            </div>
                            <div style={styles.cardInfo}>
                                <div style={styles.cardName}>{member.displayName}</div>
                                <div style={styles.cardMeta}>
                                    Reg: {member.registrationNumber || 'N/A'}
                                    {member.fatherName && ` · Father: ${member.fatherName}`}
                                </div>
                                {status && (
                                    <div style={{ marginTop: 6 }}>
                                        <Progress
                                            percent={Math.round(status.percentage)}
                                            size="small"
                                            status={isDone ? 'success' : 'active'}
                                            strokeColor={isDone ? t.green.text : isPartial ? t.amber.text : '#1677ff'}
                                            showInfo={false}
                                        />
                                    </div>
                                )}
                            </div>
                            <div style={styles.cardRight}>
                                {status && (
                                    <span style={{ fontSize: 13, color: '#595959' }}>
                                        <strong style={{ color: '#141414' }}>{status.generated}</strong> / {status.total}
                                    </span>
                                )}
                                {isDeleteMode ? (
                                    <>
                                        <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                                            {status?.allDocs?.length || 0} total · {status?.paidCount || 0} paid
                                        </span>
                                        <Button
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                            disabled={isBusy || !(status?.allDocs?.length)}
                                            onClick={() => handleDeleteForClosingMember(member.id)}
                                        >
                                            Delete entries
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        size="small"
                                        type={isDone ? 'default' : 'primary'}
                                        ghost={!isDone}
                                        disabled={isDone || isBusy}
                                        onClick={() => handleGenerateForClosingMember(member.id)}
                                        style={isDone ? { color: t.green.text, borderColor: t.green.border, background: t.green.bg } : {}}
                                    >
                                        {isDone ? '✓ Complete' : isPartial ? 'Generate remaining' : 'Generate all'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
    }

    return (
        <Drawer
            title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
                    <FileDoneOutlined style={{ color: '#0958d9' }} />
                    Generate Rasid Entry
                </span>
            }
            placement="right"
            onClose={() => { if (!isBusy) setOpen(false) }}
            open={open}
            width={620}
            destroyOnHidden
            closable={!isBusy}
            maskClosable={!isBusy}
            bodyStyle={{ padding: 0 }}
            footer={
                <div style={styles.footer}>
                    <span style={{ fontSize: 13, color: '#8c8c8c' }}>
                        {(isChecking || isScanning) && <Spin size="small" style={{ marginRight: 8 }} />}
                        {isCleanupMode
                            ? (scanResult
                                ? `${scanResult.totalIssues} issue(s) in ${scanResult.totalDocs} entries`
                                : 'Run a scan to check for duplicates and unlinked entries')
                            : isDeleteMode
                                ? (selectedClosingMembers.length > 0 &&
                                    `${deletePreview.targets.length} entr${deletePreview.targets.length === 1 ? 'y' : 'ies'} will be deleted`)
                                : (totalCombinations > 0 && `${totalGeneratedPayments} / ${totalCombinations} generated`)}
                    </span>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <Button onClick={() => setOpen(false)} disabled={isBusy}>Cancel</Button>
                        {isCleanupMode ? (
                            <Button
                                danger
                                type="primary"
                                icon={<DeleteOutlined />}
                                onClick={() => runCleanup(Object.keys(ISSUE_META))}
                                loading={isDeleting}
                                disabled={isBusy || !scanResult || scanResult.totalIssues === 0}
                            >
                                Clean all
                                {scanResult?.totalIssues > 0 && (
                                    <span style={styles.pendingBadge}>{scanResult.totalIssues}</span>
                                )}
                            </Button>
                        ) : isDeleteMode ? (
                            <Button
                                danger
                                type="primary"
                                icon={<DeleteOutlined />}
                                onClick={handleDeletePayments}
                                loading={isDeleting}
                                disabled={isBusy || !selectedClosingMembers.length || deletePreview.targets.length === 0}
                            >
                                Delete entries
                                {deletePreview.targets.length > 0 && (
                                    <span style={styles.pendingBadge}>{deletePreview.targets.length}</span>
                                )}
                            </Button>
                        ) : (
                            <Button
                                type="primary"
                                icon={<BoldOutlined />}
                                onClick={handleGeneratePayments}
                                loading={isGenerating}
                                disabled={isBusy || !selectedClosingMembers.length || !selectedMembers.length || pendingCount === 0}
                            >
                                Generate all
                                {pendingCount > 0 && (
                                    <span style={styles.pendingBadge}>{pendingCount} pending</span>
                                )}
                            </Button>
                        )}
                    </div>
                </div>
            }
        >
            <div style={styles.content}>

                {/* ── Mode switch ── */}
                <Segmented
                    block
                    value={mode}
                    onChange={setMode}
                    disabled={isBusy}
                    style={{ marginBottom: 16 }}
                    options={[
                        {
                            value: 'generate',
                            label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <FileDoneOutlined /> Generate entries
                                </span>
                            ),
                        },
                        {
                            value: 'delete',
                            label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <DeleteOutlined /> Delete
                                </span>
                            ),
                        },
                        {
                            value: 'cleanup',
                            label: (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <WarningOutlined /> Cleanup
                                    {scanResult?.totalIssues > 0 && (
                                        <Badge
                                            count={scanResult.totalIssues}
                                            style={{ backgroundColor: t.red.text }}
                                            overflowCount={999}
                                        />
                                    )}
                                </span>
                            ),
                        },
                    ]}
                />

                {/* ── Live progress for either operation ── */}
                {progress && (
                    <div style={{
                        background: isDeleteMode ? t.red.bg : t.blue.bg,
                        border: `0.5px solid ${isDeleteMode ? t.red.border : t.blue.border}`,
                        borderRadius: 8, padding: '12px 14px', marginBottom: 16,
                    }}>
                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            fontSize: 13, fontWeight: 600,
                            color: isDeleteMode ? t.red.text : t.blue.text, marginBottom: 6,
                        }}>
                            <span>{progress.label}…</span>
                            <span>{progress.done} / {progress.total}</span>
                        </div>
                        <Progress
                            percent={progress.total ? Math.round((progress.done / progress.total) * 100) : 0}
                            size="small"
                            status="active"
                            strokeColor={isDeleteMode ? t.red.text : t.blue.text}
                        />
                        <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 4 }}>
                            Writing in batches of {BATCH_LIMIT} — please keep this drawer open
                        </div>
                    </div>
                )}

                {/* ── Cleanup panel ── */}
                {isCleanupMode && (
                    <>
                        <div style={{
                            background: t.amber.bg, border: `0.5px solid ${t.amber.border}`,
                            borderRadius: 8, padding: '14px 16px', marginBottom: 16,
                        }}>
                            <div style={{ ...styles.infoBoxTitle, color: t.amber.text }}>
                                <WarningOutlined /> payment_pending health check
                            </div>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 12 }}>
                                Scans the whole collection for duplicate entries and entries that
                                are not properly linked to a closing member.
                            </div>
                            <Button
                                type="primary"
                                icon={<ReloadOutlined />}
                                onClick={scanPaymentIssues}
                                loading={isScanning}
                                disabled={isBusy}
                            >
                                {scanResult ? 'Re-scan' : 'Run scan'}
                            </Button>
                            {scanResult && (
                                <span style={{ marginLeft: 12, fontSize: 12, color: '#8c8c8c' }}>
                                    {scanResult.totalDocs} entries scanned · {scanResult.scannedAt}
                                </span>
                            )}
                        </div>

                        {scanResult && scanResult.totalIssues === 0 && (
                            <Alert
                                type="success"
                                showIcon
                                style={{ marginBottom: 16 }}
                                message="No issues found"
                                description="No duplicates and every entry is linked to a valid closing member."
                            />
                        )}

                        {scanResult && scanResult.totalIssues > 0 && (
                            <>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    marginBottom: 12, flexWrap: 'wrap',
                                }}>
                                    <Switch
                                        size="small"
                                        checked={includePaid}
                                        onChange={setIncludePaid}
                                        disabled={isBusy}
                                    />
                                    <span style={{ fontSize: 13, color: includePaid ? t.red.text : '#595959' }}>
                                        Also delete <strong>paid</strong> entries
                                    </span>
                                    <Button
                                        danger
                                        size="small"
                                        icon={<DeleteOutlined />}
                                        style={{ marginLeft: 'auto' }}
                                        disabled={isBusy}
                                        onClick={() => runCleanup(Object.keys(ISSUE_META))}
                                    >
                                        Clean all ({scanResult.totalIssues})
                                    </Button>
                                </div>

                                {Object.entries(ISSUE_META).map(([key, meta]) => {
                                    const list = scanResult.issues[key] || []
                                    if (list.length === 0) return null
                                    const paidInList = list.filter(p => p.status === 'paid').length
                                    return (
                                        <div
                                            key={key}
                                            style={{
                                                border: '0.5px solid #e0e0e0', borderLeft: `3px solid ${t.red.text}`,
                                                borderRadius: 8, padding: '12px 14px', marginBottom: 8,
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 14, fontWeight: 500 }}>
                                                        {meta.label}
                                                        <Tag color="red" style={{ marginLeft: 8, fontSize: 11 }}>{list.length}</Tag>
                                                        {paidInList > 0 && (
                                                            <Tag color="green" style={{ fontSize: 11 }}>{paidInList} paid</Tag>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                                                        {meta.hint}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    disabled={isBusy}
                                                    onClick={() => runCleanup([key])}
                                                >
                                                    Delete
                                                </Button>
                                            </div>

                                            {/* first few affected rows, for confidence before deleting */}
                                            <div style={{ marginTop: 8, fontSize: 11, color: '#8c8c8c' }}>
                                                {list.slice(0, 3).map(p => (
                                                    <div key={p.docId} style={{ fontFamily: 'monospace' }}>
                                                        {p.docId}
                                                        {p.memberDetails?.displayName ? ` · ${p.memberDetails.displayName}` : ''}
                                                        {p.paymentFor ? ` → ${p.paymentFor}` : ''}
                                                        {` · ${p.status || 'pending'}`}
                                                        {p.keptDocId ? `  (keeping ${p.keptDocId})` : ''}
                                                    </div>
                                                ))}
                                                {list.length > 3 && <div>…and {list.length - 3} more</div>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </>
                        )}
                    </>
                )}

                {/* ── Closing group filter (multi-select) ── */}
                {!isCleanupMode && (
                <>
                <div style={styles.sectionLabel}>
                    <InfoCircleOutlined /> Filter by closing group (multi-select)
                    {selectedGroupIds.length > 0 && (
                        <span style={styles.countPill}>{selectedGroupIds.length} selected</span>
                    )}
                </div>
                <Select
                    style={{ width: '100%', marginBottom: 16 }}
                    placeholder="All closing members (no filter)"
                    mode="multiple"
                    value={selectedGroupIds}
                    onChange={(vals) => {
                        setSelectedGroupIds(vals)
                        setSelectedClosingMembers([])
                    }}
                    loading={isLoading}
                    notFoundContent="No groups found"
                    showSearch
                    maxTagCount="responsive"
                    maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                    filterOption={(input, option) =>
                        option?.children?.props?.children?.[0]?.props?.children?.toLowerCase().includes(input.toLowerCase()) ?? false
                    }
                    dropdownRender={(menu) => (
                        <>
                            {menu}
                            {selectedGroupIds.length > 0 && (
                                <div style={{ padding: '6px 12px', borderTop: '0.5px solid #f0f0f0' }}>
                                    <Button type="link" size="small" onClick={() => setSelectedGroupIds([])} style={{ padding: 0 }}>
                                        Clear all
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                >
                    {closingGroups.map(g => (
                        <Option key={g.id} value={g.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{g.name}</span>
                                <Badge count={g.memberCount || 0} showZero style={{ backgroundColor: '#10b981' }} />
                            </div>
                        </Option>
                    ))}
                </Select>

                {/* ── Closing members select ── */}
                <div style={styles.sectionHeader}>
                    <div style={styles.sectionLabel}>Closing members (marriage cases)</div>
                    <Space size={6}>
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, fontSize: 12 }}
                            disabled={isBusy || allClosingSelected || filteredClosingMembers.length === 0}
                            onClick={selectAllClosingMembers}
                        >
                            Select all ({filteredClosingMembers.length})
                        </Button>
                        {selectedClosingMembers.length > 0 && (
                            <span style={styles.countPill}>{selectedClosingMembers.length} selected</span>
                        )}
                    </Space>
                </div>
                <Select
                    style={{ width: '100%', marginBottom: 16 }}
                    placeholder="Search by name, reg. no., father's name or phone…"
                    mode="multiple"
                    value={selectedClosingMembers}
                    onChange={setSelectedClosingMembers}
                    loading={isLoading}
                    showSearch
                    filterOption={filterClosingMember}
                    maxTagCount="responsive"
                    maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                    notFoundContent="No members found"
                    dropdownRender={(menu) => (
                        <>
                            {menu}
                            <div style={{
                                display: 'flex', gap: 14, padding: '6px 12px',
                                borderTop: '0.5px solid #f0f0f0',
                            }}>
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0 }}
                                    disabled={allClosingSelected || filteredClosingMembers.length === 0}
                                    onClick={selectAllClosingMembers}
                                >
                                    Select all ({filteredClosingMembers.length})
                                </Button>
                                {selectedClosingMembers.length > 0 && (
                                    <Button type="link" size="small" style={{ padding: 0 }}
                                        onClick={() => setSelectedClosingMembers([])}>
                                        Clear all
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                >
                    {filteredClosingMembers.map((member) => {
                        const status = closingMembersStatus.get(member.id)
                        const isDone = status && status.generated === status.total && status.total > 0
                        const isPartial = status && status.generated > 0 && !isDone
                        return (
                            <Option key={member.id} value={member.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {isDone
                                        ? <CheckCircleOutlined style={{ color: t.green.text }} />
                                        : isPartial
                                        ? <ClockCircleOutlined style={{ color: t.amber.text }} />
                                        : <FileOutlined style={{ color: '#bfbfbf' }} />
                                    }
                                    <span style={{ fontWeight: 500 }}>{member.displayName}</span>
                                    {member.closingGroupName && (
                                        <span style={{ color: '#8c8c8c', fontSize: 12 }}>[{member.closingGroupName}]</span>
                                    )}
                                    {status && status.total > 0 && (
                                        <Tag color={isDone ? 'green' : isPartial ? 'orange' : 'default'} style={{ marginLeft: 'auto', fontSize: 11 }}>
                                            {status.generated}/{status.total}
                                        </Tag>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', paddingLeft: 22 }}>
                                    Reg: {member.registrationNumber || 'N/A'}
                                    {member.fatherName && ` · Father: ${member.fatherName}`}
                                    {member.phone && ` · ${member.phone}`}
                                </div>
                                {status && status.total > 0 && (
                                    <Progress
                                        percent={Math.round(status.percentage)}
                                        size="small"
                                        showInfo={false}
                                        status={isDone ? 'success' : 'active'}
                                        strokeColor={isDone ? t.green.text : t.amber.text}
                                        style={{ marginLeft: 22, marginTop: 4 }}
                                    />
                                )}
                            </Option>
                        )
                    })}
                </Select>

                <Divider style={{ margin: '8px 0 16px' }} />

                {/* ── Delete options ── */}
                {isDeleteMode && (
                    <div style={{
                        background: t.red.bg, border: `0.5px solid ${t.red.border}`,
                        borderRadius: 8, padding: '14px 16px', marginBottom: 16,
                    }}>
                        <div style={{ ...styles.infoBoxTitle, color: t.red.text }}>
                            <DeleteOutlined /> Delete options
                        </div>

                        <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>What to delete</div>
                            <Select
                                style={{ width: '100%' }}
                                value={deleteScope}
                                onChange={setDeleteScope}
                                disabled={isBusy}
                                options={[
                                    { value: 'all', label: 'All entries of the selected closing members' },
                                    {
                                        value: 'selected',
                                        label: `Only entries for the selected members (${selectedMembers.length})`,
                                        disabled: selectedMembers.length === 0,
                                    },
                                ]}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Switch
                                size="small"
                                checked={includePaid}
                                onChange={setIncludePaid}
                                disabled={isBusy}
                            />
                            <span style={{ fontSize: 13, color: includePaid ? t.red.text : '#595959' }}>
                                Also delete <strong>paid</strong> entries
                            </span>
                        </div>

                        {includePaid ? (
                            <Alert
                                type="error"
                                showIcon
                                style={{ marginTop: 10, fontSize: 12 }}
                                message="Paid entries will be permanently removed — collected money records will be lost."
                            />
                        ) : (
                            deletePreview.protectedPaid > 0 && (
                                <div style={{ fontSize: 12, color: t.green.text, marginTop: 8 }}>
                                    ✓ {deletePreview.protectedPaid} paid entry(s) will be kept
                                </div>
                            )
                        )}

                        <div style={{ fontSize: 12, color: '#595959', marginTop: 10 }}>
                            Entries are removed permanently, but IDs are deterministic — you can
                            re-create them any time from the Generate tab.
                        </div>
                    </div>
                )}

                {/* ── Agent filter for the payer list ── */}
                <div style={styles.sectionLabel}>
                    <TeamOutlined /> Filter members by agent
                    {agentFilter !== null && (
                        <span style={styles.countPill}>{membersForSelection.length} member(s)</span>
                    )}
                </div>
                <Select
                    style={{ width: '100%', marginBottom: 14 }}
                    placeholder={`All agents (${allMembersData.length} members)`}
                    value={agentFilter}
                    onChange={handleAgentFilterChange}
                    disabled={isBusy}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    options={agentOptions}
                    notFoundContent="No agents found"
                />

                {/* ── Members select ── */}
                <div style={styles.sectionHeader}>
                    <div style={styles.sectionLabel}>
                        {isDeleteMode
                            ? 'Members (only needed for the "selected members" scope)'
                            : 'Members to generate payments for'}
                    </div>
                    <Space size={6}>
                        <Button
                            size="small"
                            type="link"
                            style={{ padding: 0, fontSize: 12 }}
                            disabled={isBusy || allMembersSelected || selectableMembers.length === 0}
                            onClick={selectAllMembers}
                        >
                            Select all ({selectableMembers.length})
                        </Button>
                        {selectedMembers.length > 0 && (
                            <span style={styles.countPill}>{selectedMembers.length} selected</span>
                        )}
                    </Space>
                </div>
                <Select
                    style={{ width: '100%', marginBottom: 4 }}
                    placeholder="Search by name, reg. no., father's name or phone…"
                    mode="multiple"
                    value={selectedMembers}
                    onChange={setSelectedMembers}
                    loading={isLoading}
                    showSearch
                    filterOption={filterAllMember}
                    maxTagCount="responsive"
                    maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                    notFoundContent="No members found"
                    dropdownRender={(menu) => (
                        <>
                            {menu}
                            <div style={{
                                display: 'flex', gap: 14, padding: '6px 12px',
                                borderTop: '0.5px solid #f0f0f0',
                            }}>
                                <Button
                                    type="link"
                                    size="small"
                                    style={{ padding: 0 }}
                                    disabled={allMembersSelected || selectableMembers.length === 0}
                                    onClick={selectAllMembers}
                                >
                                    Select all ({selectableMembers.length})
                                </Button>
                                {selectedMembers.length > 0 && (
                                    <Button type="link" size="small" style={{ padding: 0 }}
                                        onClick={() => setSelectedMembers([])}>
                                        Clear all
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                >
                    {membersForSelection.map((member) => {
                        let paymentCount = 0
                        for (const cid of selectedClosingMembers)
                            if (existingPaymentsMap.has(`${cid}_${member.id}`)) paymentCount++
                        const total = selectedClosingMembers.length
                        const isFullyPaid = total > 0 && paymentCount === total

                        return (
                            <Option key={member.id} value={member.id}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {paymentCount > 0 && <CheckCircleOutlined style={{ color: t.green.text }} />}
                                    <span style={{ fontWeight: 500 }}>{member.displayName}</span>
                                    {member.marriage_flag && <Tag color="orange" style={{ fontSize: 11 }}>Closed</Tag>}
                                    {paymentCount > 0 && (
                                        <Tag color={isFullyPaid ? 'green' : 'blue'} style={{ marginLeft: 'auto', fontSize: 11 }}>
                                            {paymentCount}/{total}
                                        </Tag>
                                    )}
                                </div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', paddingLeft: paymentCount > 0 ? 22 : 0 }}>
                                    Reg: {member.registrationNumber || 'N/A'}
                                    {member.fatherName && ` · Father: ${member.fatherName}`}
                                    {member.phone && ` · ${member.phone}`}
                                    {member.closingGroupName && (
                                        <span style={{ color: '#8c8c8c', fontSize: 11 }}> · Group: {member.closingGroupName}</span>
                                    )}
                                    {member.agentId && (
                                        <span style={{ color: '#8c8c8c', fontSize: 11 }}>
                                            {' '}· Agent: {agentNameById.get(member.agentId) || 'Unknown'}
                                        </span>
                                    )}
                                </div>
                            </Option>
                        )
                    })}
                </Select>

                {/* ── Closing member cards ── */}
                {selectedClosingMembers.length > 0 && (selectedMembers.length > 0 || isDeleteMode) && (
                    <>
                        <Divider style={{ margin: '16px 0' }} />
                        {renderClosingCards()}
                    </>
                )}

                {/* ── Summary stats ── */}
                {!isDeleteMode && totalCombinations > 0 && (
                    <>
                        <div style={styles.statsGrid}>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Combinations</div>
                                <div style={styles.statValue()}>
                                    {totalCombinations}
                                </div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Generated</div>
                                <div style={styles.statValue(t.green.text)}>
                                    {totalGeneratedPayments}
                                </div>
                            </div>
                            <div style={styles.statCard}>
                                <div style={styles.statLabel}>Pending</div>
                                <div style={styles.statValue(pendingCount > 0 ? t.amber.text : t.green.text)}>
                                    {pendingCount}
                                </div>
                            </div>
                        </div>

                        <div style={styles.infoBox}>
                            <div style={styles.infoBoxTitle}>
                                <InfoCircleOutlined /> Payment generation summary
                            </div>
                            <div style={styles.infoGrid}>
                                <div style={styles.infoItem}>
                                    Amount per member{' '}
                                    <strong>₹{allMembersData.find(m => selectedMembers.includes(m.id))?.payAmount || 200}</strong>
                                </div>
                                <div style={styles.infoItem}>Due date <strong>+30 days</strong></div>
                            </div>
                            <div>
                                {[
                                    'Skips already existing payments',
                                    'Skips members who joined after marriage date',
                                    'Skips already closed or married members',
                                ].map(text => (
                                    <div key={text} style={styles.skipItem}>
                                        <span style={{ marginTop: 2 }}>·</span> {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                </>
                )}

                {/* ── Result chips ── */}
                {!isCleanupMode && Object.keys(paymentGenerationStatus).length > 0 && (
                    <>
                        <div style={styles.sectionLabel}>Last generation results</div>
                        <div style={styles.resultsGrid}>
                            {genResults.map(({ label, color, count }) => (
                                <div key={label} style={styles.chip(color)}>
                                    <div style={styles.chipVal(color)}>{count}</div>
                                    <div style={styles.chipLbl(color)}>{label}</div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    )
}

export default GenerateRasidEntry