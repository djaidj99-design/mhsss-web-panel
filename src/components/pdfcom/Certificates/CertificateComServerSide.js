import React from 'react';
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  PDFViewer, 
  Font,
  Image
} from '@react-pdf/renderer';
import NotoSansDevanagari from '@/app/api/helperfile/static/font/NotoSansDevanagari';
import NotoSansDevanagariBold from '@/app/api/helperfile/static/font/NotoSansDevanagariBold';

import { TrsutData } from '@/lib/constentData';


// Register Devanagari Font
Font.register({
  family: 'NotoSansDevanagari',
  fonts: [
    {
      src:NotoSansDevanagari ,
      fontWeight: 'normal',
    },
    {
      src: NotoSansDevanagariBold,
      fontWeight: 'bold',
    }
  ]
});

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    fontFamily: 'NotoSansDevanagari',
    width: '210mm',
    height: '148mm',
    position: 'relative',
  },
  outerBorder: {
    // border: '4px solid #d4af37',
    // padding: 8,
    height: '100%',
    width: '100%',
    position: 'relative',
    // borderRadius: 4,
  },
  innerBorder: {
    // border: '2px solid #d4af37',
    padding: 28,
    height: '100%',
    width: '100%',
    position: 'relative',
  },
  topText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  smallText: {
    fontSize: 10,
    color: '#8B0000',
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  logoImage: {
    width: 68,
    height: 68,
    borderRadius: 4,
  },
  logoImage1: {
    width: 78,
    height: 68,
    borderRadius: 4,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  mainTitle: {
    fontSize: 26,
    color: '#8B0000',
    fontWeight: 'bold',
    marginBottom: 4,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  subTitle: {
    fontSize: 13,
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  address: {
    fontSize: 9,
    color: '#333',
    textAlign: 'center',
    marginBottom: 3,
    lineHeight: 1.3,
    paddingHorizontal: 10,
  },
  phoneNumbers: {
    fontSize: 9,
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  schemeBox: {
  
    alignSelf: 'center',
    marginTop:40
  
  },
  schemeText: {
    fontSize: 16,
    color: '#5c1e8b',
    fontWeight: 'bold',
    letterSpacing: 0.4,
  },
  formSection: {
    marginTop:50,
    paddingHorizontal: 5,
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 7,
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '80%',
  },
  label: {
    fontSize: 11,
    color: '#13306b',
    marginRight: 4,
    fontWeight: '600',
    minWidth: 80,
    textAlign: 'left',
  },
  value: {
    fontSize: 11,
    color: '#be9207',
    fontWeight: 'bold',
    textAlign: 'left',
    // borderBottom: '1px dotted #000',
    paddingBottom: 2,
    minHeight: 16,
    textTransform:'capitalize'
  },
  memberIdBox: {
    position: 'absolute',
    right: 40,
    top: 180,
    border: '2px solid #333',
    width: 80,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 3,
    overflow: 'hidden',
  },
  memberIdText: {
    fontSize: 8,
    textAlign: 'center',
    color: '#666',
    marginTop: 2,
  },
  memberIdLabel: {
    fontSize: 8,
    textAlign: 'center',
    color: '#666',
    paddingTop: 10,
  },
  detailsSection: {
    fontFamily: 'NotoSansDevanagari',
    fontSize: 8,
    color: '#000',
    textAlign: 'justify',
    lineHeight: 1.4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    
    backgroundColor:'transparent',
    borderRadius: 2,
    // border: '0.5px solid #ddd',
  },
  footerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // alignItems: 'flex-end',
    // marginTop: 'auto',
    paddingTop: 8,
  },
  leftFooter: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: '50%',
  },
  rightFooter: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    width: '50%',
  },
  footerLabel: {
    fontSize: 9.5,
    color: '#666',
    marginTop:5,
    fontWeight: 'bold',
  },
  footerValue: {
    fontSize: 9.5,
    color: '#000',
    fontWeight: 'bold',
    paddingTop: 1,
    textAlign: 'left',
    marginTop: 2,
    
  },
  signatureText: {
    fontSize: 10,
    color: '#000',
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'right',
    borderTop: '1px solid #000',
    paddingTop: 3,
    minWidth: 140,
  },
  serialNumber: {
    position: 'absolute',
    top: -10,
    right: 24,
    fontSize: 10,
    color: '#000',
    fontWeight: 'bold',
    backgroundColor: '#fff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  fieldGroup: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
    width: '50%',
  },
  watermark: {
    position: 'absolute',
    top: '28mm',
    left: '42mm',
    width: '115mm',
    height: '85mm',
    opacity: 0.08,
    zIndex: 0,
  },
  photoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  donationHighlight: {
    backgroundColor: '#fff3cd',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginLeft: 2,
  },
  colon:{
    fontSize: 11,
    color: '#333',
    marginRight: 4,
  },
  DashBorder:{
    borderBottom: '1px dashed #d4af37',
  },
FeesSection: {
  flexDirection: 'row',
  width: '100%',
},

feesRow: {
  width: '50%',
  border: '1px solid #d4af37',
  paddingVertical: 3,
  paddingHorizontal: 5,
  backgroundColor: '#fffdf5',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 4
},

feesLabel: {
  fontSize: 10,
  color: '#666',
  marginBottom: 2,
  fontWeight: 500,
},

feesValue: {
  fontSize: 11,
  color: '#000',
  fontWeight: 'bold',
},
regNoBox:{
  position:'absolute',
  top:-30,
  left:2,
  flexDirection:'row',
  alignItems:'center',
},
JoinDateBox:{
   position:'absolute',
  top:-30,
  right:20,
  flexDirection:'row',
  alignItems:'center',
  minWidth: 60,
},
labelJoinDate:{
  fontSize: 11,
    color: '#13306b',
    marginRight: 4,
    fontWeight: '600',
    textAlign: 'left',
},
valueJoinDate:{
  fontSize: 11,
    color: '#be9207',
    fontWeight: 'bold',
    textAlign: 'left',
    // borderBottom: '1px dotted #000',
    textTransform:'capitalize',
    // borderBottom:'1px dotted #000',
},
agentCode:{
      fontSize: 9.5,
    color: '#ef4444',
    marginTop:5,
    fontWeight: 'bold',
}

});

const Certificate = ({data,selectedProgram}) => (
      <Page size={{ width: '210mm', height: '148mm' }} style={styles.page}>
   
        <View style={styles.outerBorder}>
           <Image src={TrsutData.frameImg}style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '210mm',
      height: '148mm',
      zIndex: -1,
    }} />
        {/* <Text style={styles.serialNumber}>{data?.registrationNumber}</Text> */}
        <View style={styles.innerBorder}>
          {/* Top Text */}
  

          {/* Watermark */}
          <Image 
           src={TrsutData.logo}
            style={styles.watermark}
          />

          {/* Header Section */}
          {/* <View style={styles.headerSection}>
            
         
            
            <View style={styles.centerContent}>
              <Text style={styles.mainTitle}>श्री साँवलाजी सेवा संस्थान</Text>
              <Text style={styles.subTitle}>अहमदाबाद-गुजरात</Text>
              <Text style={styles.address}>
                20/2, शिवम् फ्लेट, आनंद फ्लेट पुलिस चौकी के पास, बापूनगर, अहमदाबाद
              </Text>
              <Text style={styles.phoneNumbers}>
                9723878021 / 8511878021 / 9408323975
              </Text>
              <View style={styles.schemeBox}>
                <Text style={styles.schemeText}>{selectedProgram?.hiname}</Text>
              </View>
            </View>

        
          </View> */}
       <View style={{
        height:60,
        width:'100%',
       }}>

       </View>
          {/* Member ID Box */}
          <View style={styles.memberIdBox}>
            {data?.photoURL ? (
              <Image src={data.photoURL} style={styles.photoImage} />
            ) : (
              <View>
                <Text style={styles.memberIdLabel}>सदस्य फोटो</Text>
              </View>
            )}
          </View>
         <View style={styles.schemeBox}>
                <Text style={styles.schemeText}>{selectedProgram?.hiname}</Text>
              </View>
       
          {/* Form Section */}
          <View style={styles.formSection}>
            <view style={styles.regNoBox}>
            <Text style={styles.labelJoinDate}> सदस्यता क्रमांक : </Text>
            <Text style={[styles.valueJoinDate,{
              color:"#ef4444"
            }]}>{data?.registrationNumber}</Text>
            </view>
                    <view style={styles.JoinDateBox}>
            <Text style={styles.labelJoinDate}>दिनांक : </Text>
            <Text style={styles.valueJoinDate}>{data?.dateJoin}</Text>
            </view>
            <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>नाम</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.displayName}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>आधार नंबर</Text>
                    <Text style={styles.colon}>:</Text>

                    <Text style={styles.value}>{data?.aadhaarNo}</Text>
                  </view>
            </View>
                     <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>पिता/पति का नाम</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.fatherName}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>जन्म तिथि</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.bobDate}</Text>
                  </view>
            </View>
                <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>वारसदार</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.guardian}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>संबंध</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.guardianRelation}</Text>
                  </view>
            </View>
              <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>जाति</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.jati}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>गोत्र</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.gotra}</Text>
                  </view>
            </View>
                     <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>मोबाइल नंबर</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.phone}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>गाँव/शहर</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.village}</Text>
                  </view>
            </View>
            <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}>जिला</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.district}</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}>राज्य</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>{data?.state}</Text>
                  </view>
            </View>
              <View style={styles.row}>
                  <view style={styles.fieldGroup}>
                    <Text style={styles.label}> प्रवेश शुल्क</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>₹ {data?.joinFees} /-</Text>
                  </view>
                <view style={styles.fieldGroup}>
                    <Text style={styles.label}> सहयोग राशि</Text>
                    <Text style={styles.colon}>:</Text>
                    <Text style={styles.value}>₹ {data?.payAmount} /-</Text>
                  </view>
            </View>
          </View>
          <View style={styles.DashBorder}>

          </View>

          {/* Details Section */}
          {
            selectedProgram?.noteLine && <View style={styles.detailsSection}>
            <Text style={{
              color:'#8B0000',
              fontWeight:'bold',
            }}>
            -: नोट : {selectedProgram?.noteLine}
            </Text>
          </View>
          }
       


   <View style={styles.footerSection}>
           
                <View style={styles.leftFooter}>
              <Text style={styles.footerValue}>{data?.addedByName || '---'} ({data.agentPhone})</Text>
              <View style={{
                flexDirection:'row',
                
              }}>
              <Text style={styles.footerLabel}>कार्यकर्ता </Text>
              <Text style={styles.agentCode}>{data?.agentCode ?` (${data?.agentCode})`:null}</Text>
                </View>
            </View>
             <View style={styles.rightFooter}>
           <Text style={styles.footerValue}>
 {TrsutData.name}
</Text>
              <Text style={styles.footerLabel}>संस्थापक</Text>
            </View>

           </View>
        </View> 
      
      </View>
    </Page>
)

const CertificateComServerSide = ({data,selectedProgram}) => {
    const membersArray = Array.isArray(data) ? data : [data];
  return(
  <Document>
 {membersArray.map((member, index) => (
        <Certificate 
          key={member?.id || member?.registrationNumber || index}
          data={member}
          selectedProgram={selectedProgram}
          index={index}
        />
      ))}
  </Document>
);}

export default CertificateComServerSide;