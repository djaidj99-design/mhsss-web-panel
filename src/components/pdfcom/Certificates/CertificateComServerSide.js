import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image
} from '@react-pdf/renderer';
import NotoSansDevanagari from '@/app/api/helperfile/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helperfile/static/font/NotoSansDevanagariBold';
import { TrsutData } from '@/lib/constentData';

// ── Fonts ────────────────────────────────────────────────────────────────────
Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    { src: NotoSansDevanagari, fontWeight: 'normal' },
    { src: NotoSansDevanagariBold, fontWeight: 'bold' },
  ],
});

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
  },

  // Full-page frame image (absolute background)
  frameImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '210mm',
    height: '148mm',
  },

  // Faint logo watermark centred on the content area
  watermark: {
    position: 'absolute',
    top: '38mm',
    left: '44mm',
    width: '116mm',
    height: '70mm',
    opacity: 0.06,
  },

  // Main content wrapper – sits on top of the frame image
  contentWrapper: {
    paddingHorizontal: 22,
  },

  // ── Spacer ──────────────────────────────────────────────────────────────
  // The frame's header (logo + org name + address + reg. no.) occupies
  // roughly the top 40-42 % of the A5-landscape page (148 mm = 419 pt).
  // 40 % × 419 ≈ 168 pt  →  headerSpacer pushes content below the header.
  // Fine-tune this single value if the content drifts up or down.
  headerSpacer: {
    height: 150,
  },

  // ── Top info row (Member No | Scheme banner | Date) ──────────────────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  topLabel: {
    fontSize: 9,
    color: '#13306b',
    fontWeight: 'bold',
    marginBottom: 3,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  // Digit box used for member number and date
  digitBox: {
    width: 15,
    height: 18,
    border: '1.5px solid #333',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginRight: 2,
  },
  digitText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111',
  },
  digitRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Scheme/program name banner
  schemeBanner: {
    backgroundColor: '#6B1A1A',
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 4,
    border: '2px solid #c9a227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  schemeText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },

  // ── Main content: fields (left) + photo (right) ──────────────────────────
  mainContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
  },
  fieldsSection: {
    flex: 1,
    marginRight: 5,
  },
  fieldRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  fieldGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingRight: 4,
  },
  fieldLabel: {
    fontSize: 9.5,
    color: '#8B0000',
    fontWeight: 'bold',
  },
  fieldColon: {
    fontSize: 9.5,
    color: '#444',
    marginHorizontal: 2,
  },
  fieldValue: {
    fontSize: 9.5,
    color: '#000',
    fontWeight: 'bold',
    flex: 1,
  },

  // Member photo
  photoBox: {
    width: 72,
    height: 90,
    border: '1.5px solid #555',
    overflow: 'hidden',
    backgroundColor: '#eeeeee',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  noPhotoText: {
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
  },

  // Divider before note
  dividerLine: {
    borderBottom: '0.8px dashed #8B0000',
    marginVertical: 4,
  },

  // Note / terms box
  noteBox: {
    borderWidth: 1,
    borderColor: '#888',
    borderStyle: 'dashed',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  noteText: {
    fontSize: 8,
    color: '#111',
    lineHeight: 1.45,
    textAlign: 'justify',
  },
});

// ── Sub-components ────────────────────────────────────────────────────────────

/** Single bordered digit cell */
const DigitBox = ({ digit }) => (
  <View style={styles.digitBox}>
    <Text style={styles.digitText}>{digit}</Text>
  </View>
);

/**
 * Render boxes for each character in value (letters + digits preserved).
 * If value is all-numeric and shorter than `minCount`, left-pads with zeros.
 * e.g. value="MSH001"  →  [M][S][H][0][0][1]
 *      value="482939"  →  [4][8][2][9][3][9]
 *      value="5"       →  [0][0][0][0][5]      (minCount=5)
 */
const MemberNoBoxes = ({ value = '', minCount = 5 }) => {
  const raw = String(value).trim();
  // If purely numeric, pad with leading zeros to minCount
  const str = /^\d+$/.test(raw)
    ? raw.padStart(minCount, '0').slice(-Math.max(raw.length, minCount))
    : raw;
  return (
    <View style={styles.digitRow}>
      {str.split('').map((ch, i) => <DigitBox key={i} digit={ch} />)}
    </View>
  );
};

/**
 * Render date as digit boxes grouped as  DD · MM · YYYY
 * Input dateStr: "DD-MM-YYYY"
 */
const DateBoxes = ({ dateStr = '' }) => {
  const parts = dateStr.split('-');
  const dd = (parts[0] || '').padStart(2, '0');
  const mm = (parts[1] || '').padStart(2, '0');
  const yyyy = (parts[2] || '').padStart(4, '0');
  const group = (s) => s.split('').map((d, i) => <DigitBox key={i} digit={d} />);
  return (
    <View style={styles.digitRow}>
      {group(dd)}
      <View style={{ width: 4 }} />
      {group(mm)}
      <View style={{ width: 4 }} />
      {group(yyyy)}
    </View>
  );
};

/**
 * One field: coloured label + colon + bold value.
 * `labelWidth` keeps all labels in a column aligned.
 */
const Field = ({ label, value, labelWidth = 62 }) => (
  <View style={styles.fieldGroup}>
    <Text style={[styles.fieldLabel, { minWidth: labelWidth }]}>{label}</Text>
    <Text style={styles.fieldColon}>:</Text>
    <Text style={styles.fieldValue}>{value || ''}</Text>
  </View>
);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Calculate age (in whole years) from two DD-MM-YYYY date strings.
 * Returns '' if either date is missing or invalid.
 */
const calcAge = (bobDate, referenceDate) => {
  try {
    const [bd, bm, by] = (bobDate || '').split('-').map(Number);
    const [rd, rm, ry] = (referenceDate || '').split('-').map(Number);
    if (!by || !ry) return '';
    let age = ry - by;
    if (rm < bm || (rm === bm && rd < bd)) age--;
    return age >= 0 ? String(age) : '';
  } catch {
    return '';
  }
};

// ── Certificate page ──────────────────────────────────────────────────────────

const Certificate = ({ data, selectedProgram }) => {
  // Priority: applicationNumber → registrationNumber → memberNumber
  // Keep full value including any prefix letters (e.g. "MSH001", "R482939")
  const memberNo = String(
    data?.applicationNumber ||   // e.g. "MSH001"
    data?.registrationNumber ||   // e.g. "R482939"
    data?.memberNumber ||   // e.g. 5  → "00005"
    ''
  ).trim();

  const districtState = [data?.district, data?.state].filter(Boolean).join(' - ');
  const age = calcAge(data?.bobDate, data?.dateJoin);

  return (
    <Page size={{ width: '210mm', height: '148mm' }} style={styles.page}>

      {/* ① Full-page certificate frame (contains org header, border, footer note) */}
      <Image src={TrsutData.frameImg} style={styles.frameImage} />

      {/* ② Faint watermark logo */}
      <Image src={TrsutData.logo} style={styles.watermark} />

      {/* ③ Dynamic content overlaid on the frame */}
      <View style={styles.contentWrapper}>

        {/* Skip past the frame's printed header section */}
        <View style={styles.headerSpacer} />

        {/* ── Row 1: Member no  |  Scheme banner  |  Date ── */}
        <View style={styles.topRow}>

          {/* Left – member number in digit boxes */}
          <View>
            <Text style={styles.topLabel}>सदस्यता क्रमांक</Text>
            <MemberNoBoxes value={memberNo} minCount={5} />
          </View>

          {/* Centre – programme/scheme name */}
          <View style={styles.topCenter}>
            <View style={styles.schemeBanner}>
              <Text style={styles.schemeText}>{selectedProgram?.hiname || ''}</Text>
            </View>
          </View>

          {/* Right – join date in digit boxes */}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.topLabel, { alignSelf: 'flex-end' }]}>दिनांक</Text>
            <DateBoxes dateStr={data?.dateJoin || ''} />
          </View>

        </View>

        {/* ── Row 2: two-column member fields + photo ── */}
        <View style={styles.mainContent}>

          <View style={styles.fieldsSection}>

            {/* Row 1 */}
            <View style={styles.fieldRow}>
              <Field label="नामः" value={data?.displayName} labelWidth={76} />
              <Field label="जन्मतिथि" value={data?.bobDate} labelWidth={58} />
            </View>

            {/* Row 2 */}
            <View style={styles.fieldRow}>
              <Field label="पिता/पति का नाम" value={data?.fatherName} labelWidth={76} />
              <Field label="आधार न." value={data?.aadhaarNo} labelWidth={58} />
            </View>

            {/* Row 3 */}
            <View style={styles.fieldRow}>
              <Field label="मोबाइल नं" value={data?.phone} labelWidth={76} />
              <Field label="उम्र" value={age} labelWidth={58} />
            </View>

            {/* Row 4 */}
            <View style={styles.fieldRow}>
              <Field label="वारिसदार" value={data?.guardian} labelWidth={76} />
                  <Field label="सम्बन्ध" value={data?.guardianRelation} labelWidth={58} />
           
            </View>

            {/* Row 5 */}
            <View style={styles.fieldRow}>
              <Field label="जाति" value={data?.jati} labelWidth={76} />
             <Field label="गोत्र" value={data?.gotra || ''} labelWidth={58} />
            </View>

            {/* Row 6 */}
            <View style={styles.fieldRow}>
              <Field label="गाँव" value={data?.village} labelWidth={76} />
              <Field label="निवास स्थान" value={data?.currentAddress || data?.village || ''} labelWidth={58} />
            </View>

            {/* Row 7 */}
            <View style={styles.fieldRow}>
              <Field label="Agent" value={data?.addedByName || '—'} labelWidth={76} />
              <Field label="जिला & राज्य" value={districtState} labelWidth={58} />
            </View>

          </View>

          {/* Member photo */}
          <View style={styles.photoBox}>
            {data?.photoURL
              ? <Image src={data.photoURL} style={styles.photoImage} />
              : <Text style={styles.noPhotoText}>{'सदस्य\nफोटो'}</Text>
            }
          </View>

        </View>

        {/* Divider */}
        <View style={styles.dividerLine} />

        {/* Programme-specific note / terms */}
        {selectedProgram?.noteLine && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{selectedProgram.noteLine}</Text>
          </View>
        )}

      </View>
    </Page>
  );
};

// ── Document wrapper ──────────────────────────────────────────────────────────

const CertificateComServerSide = ({ data, selectedProgram }) => {
  const membersArray = Array.isArray(data) ? data : [data];
  return (
    <Document>
      {membersArray.map((member, index) => (
        <Certificate
          key={member?.id || member?.registrationNumber || index}
          data={member}
          selectedProgram={selectedProgram}
        />
      ))}
    </Document>
  );
};

export default CertificateComServerSide;
