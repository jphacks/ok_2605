import { StyleSheet, Text, View } from 'react-native';

export function MedicineBoxArt() {
  return <View accessible accessibilityLabel="ピンクの薬箱" style={styles.boxScene}>
    <View style={styles.halo} />
    <View style={styles.box}><View style={styles.lid} /><View style={styles.clasp}><Text style={styles.cross}>＋</Text></View></View>
    <Text style={styles.star}>✧</Text>
  </View>;
}

export function BunnyArt() {
  return <View accessible accessibilityLabel="のむペイのうさぎ" style={styles.bunnyScene}>
    <View style={styles.bunnyHalo} />
    <View style={[styles.ear, styles.leftEar]} /><View style={[styles.ear, styles.rightEar]} />
    <View style={styles.face}>
      <View style={[styles.eye, { left: 28 }]} /><View style={[styles.eye, { right: 28 }]} />
      <View style={[styles.cheek, { left: 12 }]} /><View style={[styles.cheek, { right: 12 }]} />
      <Text style={styles.mouth}>ω</Text>
    </View>
    <Text style={styles.heart}>♥</Text>
  </View>;
}
const styles = StyleSheet.create({
  boxScene: { height: 160, alignItems: 'center', justifyContent: 'center', width: '100%' },
  halo: { position: 'absolute', width: 160, height: 140, borderRadius: 80, backgroundColor: '#fff0ed' },
  box: { width: 138, height: 83, backgroundColor: '#ffd9de', borderWidth: 2, borderColor: '#f4b5c1', borderRadius: 22, transform: [{ rotate: '-8deg' }], boxShadow: '0 10px 18px #d77d8d20' },
  lid: { height: 27, borderBottomWidth: 2, borderColor: '#f4b5c1', backgroundColor: '#ffe9eb', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  clasp: { position: 'absolute', top: 24, left: 55, height: 38, width: 29, borderRadius: 10, borderWidth: 1, borderColor: '#e9a2b1', backgroundColor: '#fff8f6', alignItems: 'center', justifyContent: 'center' },
  cross: { color: '#ed7994', fontSize: 24 }, star: { position: 'absolute', top: 25, right: '22%', fontSize: 30, color: '#f2bd66' },
  bunnyScene: { height: 154, width: 180, alignSelf: 'center', alignItems: 'center', justifyContent: 'flex-end' },
  bunnyHalo: { position: 'absolute', bottom: 0, width: 150, height: 125, borderRadius: 80, backgroundColor: '#ffeae5' },
  ear: { position: 'absolute', width: 29, height: 65, top: 15, backgroundColor: '#fffaf5', borderWidth: 2, borderColor: '#e6a39f', borderRadius: 20 },
  leftEar: { left: 54, transform: [{ rotate: '-9deg' }] }, rightEar: { right: 54, transform: [{ rotate: '9deg' }] },
  face: { width: 102, height: 82, marginBottom: 16, borderRadius: 42, backgroundColor: '#fffaf5', borderWidth: 2, borderColor: '#e6a39f' },
  eye: { position: 'absolute', top: 29, width: 5, height: 7, borderRadius: 3, backgroundColor: '#8b625f' },
  cheek: { position: 'absolute', top: 40, width: 19, height: 10, borderRadius: 10, backgroundColor: '#ffc5c4' },
  mouth: { position: 'absolute', alignSelf: 'center', top: 34, fontSize: 23, color: '#b67b73' },
  heart: { position: 'absolute', left: 8, top: 58, color: '#f7aab4', fontSize: 27, transform: [{ rotate: '-15deg' }] },
});
