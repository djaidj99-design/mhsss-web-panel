'use client'
// ─────────────────────────────────────────────────────────────────────────────
// भुगतान रसीद / Paid Payment History PDF
// एक या कई सदस्यों के लिए — हर सदस्य का अलग पेज-सेट, तिथिवार भुगतान विवरण।
// बकाया शून्य होने पर भी बनती है।
// ─────────────────────────────────────────────────────────────────────────────
import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font, Image } from '@react-pdf/renderer';
import NotoSansDevanagari from '@/app/api/helperfile/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helperfile/static/font/NotoSansDevanagariBold';
import { pdfColors, TrsutData } from '@/lib/constentData';
import PdfHeaderCom from '@/components/screen/agents/agentDetails/component/pdfcom/HeaderCom';
import { groupByDate } from '@/lib/paidHistory';

Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

const ROWS_PER_PAGE = 18;
const GREEN = '#237804';

const s = StyleSheet.create({
  page: { backgroundColor: pdfColors.bgColor, fontFamily: 'NotoSansDevanagari', padding: 14, fontSize: 9 },
  outer: { border: `2px solid ${pdfColors.borderColor}`, padding: 5, minHeight: '100%' },
  inner: { border: `1px solid ${pdfColors.borderColor}`, padding: 8, minHeight: '100%' },

  titleBox: { alignSelf: 'center', backgroundColor: GREEN, borderRadius: 4, paddingVertical: 3, paddingHorizontal: 14, marginBottom: 8 },
  titleText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  card: { flexDirection: 'row', border: `1.5px solid ${pdfColors.borderColor}`, borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  photoBox: { width: 70, justifyContent: 'center', alignItems: 'center', borderRight: `1px solid ${pdfColors.borderColor}`, backgroundColor: '#f5f5f5', padding: 4 },
  photo: { width: 60, height: 70, objectFit: 'cover' },
  photoText: { fontSize: 8, color: '#888', textAlign: 'center' },
  cardBody: { flex: 1, padding: 6 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { flex: 1, fontSize: 12, fontWeight: 'bold', color: pdfColors.infoValueColor, paddingRight: 6 },
  reg: { fontSize: 9, fontWeight: 'bold', color: '#fff', backgroundColor: pdfColors.schemeColor, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  infoItem: { width: '50%', flexDirection: 'row', marginBottom: 2 },
  infoLabel: { color: pdfColors.infoLabelColor, fontWeight: 'bold', marginRight: 3 },
  infoValue: { color: pdfColors.infoValueColor },

  stats: { flexDirection: 'row', marginTop: 4, gap: 4 },
  stat: { flex: 1, border: '1px solid #d9d9d9', borderRadius: 3, padding: 3, alignItems: 'center' },
  statLabel: { fontSize: 7.5, color: '#666' },
  statValue: { fontSize: 10, fontWeight: 'bold', color: pdfColors.summaryColor },

  section: { fontSize: 10, fontWeight: 'bold', color: pdfColors.filterLabelColor, marginBottom: 3 },

  table: { border: `1px solid ${pdfColors.borderColor}` },
  th: { flexDirection: 'row', backgroundColor: pdfColors.schemeColor },
  thCell: { color: '#fff', fontWeight: 'bold', padding: 3, borderRight: '1px solid #ffffff55' },
  tr: { flexDirection: 'row', borderTop: '0.5px solid #d9d9d9', minHeight: 16 },
  trAlt: { backgroundColor: '#fafafa' },
  dayRow: { flexDirection: 'row', backgroundColor: '#f6ffed', borderTop: `0.5px solid ${GREEN}` },
  td: { padding: 3, borderRight: '0.5px solid #d9d9d9' },

  cSr: { width: '6%', textAlign: 'center' },
  cDate: { width: '13%', textAlign: 'center' },
  cClosing: { width: '29%' },
  cMethod: { width: '12%', textAlign: 'center' },
  cTrx: { width: '26%' },
  cAmt: { width: '14%', textAlign: 'right', borderRight: 0 },

  totalRow: { flexDirection: 'row', backgroundColor: GREEN },
  totalText: { color: '#fff', fontWeight: 'bold', padding: 4 },

  empty: { padding: 24, alignItems: 'center' },
  note: { fontSize: 7.5, color: '#666', marginTop: 4 },

  sign: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  signText: { fontSize: 9, color: '#333', borderTop: '0.5px solid #999', paddingTop: 2, width: 140, textAlign: 'center' },

  notice: { marginTop: 'auto', paddingTop: 6 },
  noticeText: { fontSize: 8, color: pdfColors.filterLabelColor, textAlign: 'center' },
  footer: { flexDirection: 'row', borderTop: '0.5px solid #ccc', paddingTop: 3, marginTop: 4, fontSize: 7.5, color: '#555' },
});

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const methodHi = (m) => (m === 'online' ? 'ऑनलाइन' : m === 'cash' ? 'नकद' : (m || '—'));

/** एक सदस्य की rows को पेजों में बाँटो, हर दिन की उप-योग पंक्ति के साथ */
const buildLines = (rows) => {
  const lines = [];
  let sr = 0;
  for (const g of groupByDate(rows)) {
    g.rows.forEach((r, i) => { sr++; lines.push({ kind: 'row', r, sr, firstOfDay: i === 0 }); });
    if (g.rows.length > 1) lines.push({ kind: 'day', g });
  }
  return lines;
};

const Card = ({ m, h, programName, agentName }) => (
  <View style={s.card}>
    <View style={s.photoBox}>
      {m.photoURL ? <Image src={m.photoURL} style={s.photo} /> : <Text style={s.photoText}>{'फोटो\nनहीं'}</Text>}
    </View>
    <View style={s.cardBody}>
      <View style={s.nameRow}>
        <Text style={s.name}>{`${m.displayName || '—'}\u00A0\u00A0\u00A0`}</Text>
        <Text style={s.reg}>रजि. {m.registrationNumber || 'N/A'}</Text>
      </View>
      <View style={s.infoGrid}>
        <View style={s.infoItem}><Text style={s.infoLabel}>पिता/पति:</Text><Text style={s.infoValue}>{`${m.fatherName || 'N/A'}\u00A0\u00A0\u00A0`}</Text></View>
        <View style={s.infoItem}><Text style={s.infoLabel}>गाँव:</Text><Text style={s.infoValue}>{`${m.village || 'N/A'}\u00A0\u00A0\u00A0`}</Text></View>
        <View style={s.infoItem}><Text style={s.infoLabel}>योजना:</Text><Text style={s.infoValue}>{`${programName || 'N/A'}\u00A0\u00A0\u00A0`}</Text></View>
        <View style={s.infoItem}><Text style={s.infoLabel}>एजेंट:</Text><Text style={s.infoValue}>{`${agentName || m.addedByName || 'N/A'}\u00A0\u00A0\u00A0`}</Text></View>
      </View>
      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statLabel}>कुल प्राप्त राशि</Text><Text style={[s.statValue, { color: GREEN }]}>{inr(h.total)}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>भुगतान संख्या</Text><Text style={s.statValue}>{h.rows.length}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>अवधि</Text><Text style={[s.statValue, { fontSize: 8 }]}>{h.firstDate ? `${h.firstDate} से ${h.lastDate}` : '—'}</Text></View>
        <View style={s.stat}><Text style={s.statLabel}>शेष बकाया</Text><Text style={[s.statValue, { color: (m.pendingAmount || 0) > 0 ? '#cf1322' : GREEN }]}>{inr(m.pendingAmount || 0)}</Text></View>
      </View>
    </View>
  </View>
);

const Header = () => (
  <View style={s.th}>
    <Text style={[s.thCell, s.cSr]}>क्र.</Text>
    <Text style={[s.thCell, s.cDate]}>भुगतान तिथि</Text>
    <Text style={[s.thCell, s.cClosing]}>समापन (लाभार्थी)</Text>
    <Text style={[s.thCell, s.cMethod]}>माध्यम</Text>
    <Text style={[s.thCell, s.cTrx]}>रसीद / TRX नं.</Text>
    <Text style={[s.thCell, s.cAmt]}>राशि</Text>
  </View>
);

const Line = ({ l, alt }) => {
  if (l.kind === 'day') {
    return (
      <View style={s.dayRow} wrap={false}>
        <Text style={[s.td, { width: '86%', textAlign: 'right', fontWeight: 'bold', color: GREEN }]}>
          {l.g.dateLabel} को कुल प्राप्त ({l.g.rows.length} भुगतान):
        </Text>
        <Text style={[s.td, s.cAmt, { fontWeight: 'bold', color: GREEN }]}>{inr(l.g.total)}</Text>
      </View>
    );
  }
  const r = l.r;
  return (
    <View style={[s.tr, alt && s.trAlt]} wrap={false}>
      <Text style={[s.td, s.cSr]}>{l.sr}</Text>
      <Text style={[s.td, s.cDate, { fontWeight: l.firstOfDay ? 'bold' : 'normal' }]}>{l.firstOfDay ? r.dateLabel : ''}</Text>
      <Text style={[s.td, s.cClosing]}>{r.closingName || '—'}{r.closingRegNo ? ` (${r.closingRegNo})` : ''}</Text>
      <Text style={[s.td, s.cMethod]}>{methodHi(r.method)}</Text>
      <Text style={[s.td, s.cTrx, { fontSize: 7.5 }]}>
        {r.legacy ? 'पुराना भुगतान*' : (r.transactionNumber || '—')}{r.reference ? `\nUTR: ${r.reference}` : ''}
      </Text>
      <Text style={[s.td, s.cAmt, { color: GREEN, fontWeight: 'bold' }]}>{inr(r.amount)}</Text>
    </View>
  );
};

/**
 * props:
 *   members: [{ memberId|id, displayName, registrationNumber, fatherName, village,
 *               photoURL, addedByName, pendingAmount? }]
 *   historyMap: fetchPaidHistory() का परिणाम  { [memberId]: {rows,total,...} }
 *   programName, agentName
 */
const PaidHistoryPdf = ({ members = [], historyMap = {}, programName = '', agentName = '' }) => {
  const now = new Date();
  const genDate = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const genTime = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const pages = [];
  members.forEach((m) => {
    const id = m.memberId || m.id;
    const h = historyMap[id] || { rows: [], total: 0 };
    const lines = buildLines(h.rows);
    const hasLegacy = h.rows.some((r) => r.legacy);

    const chunks = [];
    // पहले पेज पर कार्ड है, इसलिए कम पंक्तियाँ
    const first = ROWS_PER_PAGE - 4;
    chunks.push(lines.slice(0, first));
    for (let i = first; i < lines.length; i += ROWS_PER_PAGE) chunks.push(lines.slice(i, i + ROWS_PER_PAGE));

    chunks.forEach((part, ci) => {
      const last = ci === chunks.length - 1;
      pages.push(
        <Page key={`${id}-${ci}`} size="A4" style={s.page}>
          <View style={s.outer}>
            <View style={s.inner}>
              <PdfHeaderCom />
              <View style={s.titleBox}><Text style={s.titleText}>भुगतान रसीद — पूर्ण भुगतान विवरण</Text></View>

              {ci === 0 ? (
                <Card m={m} h={h} programName={programName} agentName={agentName} />
              ) : (
                <Text style={s.section}>{m.displayName} ({m.registrationNumber}) — जारी, पृष्ठ {ci + 1}/{chunks.length}</Text>
              )}

              {ci === 0 && <Text style={s.section}>तिथिवार प्राप्त भुगतान</Text>}

              {h.rows.length === 0 ? (
                <View style={s.empty}>
                  <Text style={{ width: '100%', textAlign: 'center', fontSize: 12, color: pdfColors.filterLabelColor, marginBottom: 4 }}>अभी तक भुगतान प्राप्त नहीं हुआ</Text>
                  <Text style={{ width: '100%', textAlign: 'center', fontSize: 9, color: '#666' }}>इस योजना में इस सदस्य का भुगतान शून्य है।</Text>
                </View>
              ) : (
                <View style={s.table}>
                  <Header />
                  {part.map((l, i) => <Line key={i} l={l} alt={i % 2 === 1} />)}
                  {last && (
                    <View style={s.totalRow} wrap={false}>
                      <Text style={[s.totalText, { width: '86%', textAlign: 'right' }]}>
                        कुल प्राप्त राशि ({h.rows.length} भुगतान):
                      </Text>
                      <Text style={[s.totalText, s.cAmt]}>{inr(h.total)}</Text>
                    </View>
                  )}
                </View>
              )}

              {last && hasLegacy && (
                <Text style={s.note}>* पुराना भुगतान: सिस्टम में इसका अलग TRX रिकॉर्ड नहीं है (पुराना/माइग्रेटेड डेटा)।</Text>
              )}

              {last && (
                <View style={s.sign}>
                  <Text style={s.signText}>सदस्य हस्ताक्षर</Text>
                  <Text style={s.signText}>अधिकृत हस्ताक्षर</Text>
                </View>
              )}

              <View style={s.notice}>
                <Text style={s.noticeText}>यह दान स्वेच्छिक रूप से दिया गया है और किसी भी कारणवश इसकी वापसी नहीं की जाएगी।</Text>
              </View>
              <View style={s.footer}>
                <Text style={{ flex: 1 }}>{m.displayName} ({m.registrationNumber})</Text>
                <Text style={{ flex: 1, textAlign: 'center' }}>{TrsutData.name || ''}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>जनरेट: {genDate} {genTime}</Text>
              </View>
            </View>
          </View>
        </Page>
      );
    });
  });

  if (!pages.length) {
    pages.push(
      <Page key="none" size="A4" style={s.page}>
        <View style={s.outer}><View style={s.inner}>
          <PdfHeaderCom />
          <View style={s.empty}><Text style={{ width: '100%', textAlign: 'center', fontSize: 12 }}>कोई सदस्य चयनित नहीं है</Text></View>
        </View></View>
      </Page>
    );
  }

  return <Document>{pages}</Document>;
};

export default PaidHistoryPdf;
