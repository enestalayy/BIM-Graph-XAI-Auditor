/** Turkish names of the IFC classes that appear in findings; unknown classes fall back to the IFC name. */
const NAMES: Readonly<Record<string, { name: string; hint: string }>> = {
  IfcWall: { name: 'Duvar', hint: 'Bina duvarı.' },
  IfcWallStandardCase: { name: 'Duvar', hint: 'Sabit kesitli standart duvar (IFC2x3).' },
  IfcCurtainWall: { name: 'Giydirme cephe', hint: 'Taşıyıcı olmayan cam/panel cephe sistemi.' },
  IfcSlab: { name: 'Döşeme', hint: 'Kat döşemesi veya çatı plağı.' },
  IfcRoof: { name: 'Çatı', hint: 'Çatı (genellikle döşeme parçalarından oluşur).' },
  IfcBeam: { name: 'Kiriş', hint: 'Taşıyıcı yatay eleman.' },
  IfcColumn: { name: 'Kolon', hint: 'Taşıyıcı düşey eleman.' },
  IfcFooting: { name: 'Temel', hint: 'Temel elemanı.' },
  IfcDoor: { name: 'Kapı', hint: 'Kapı.' },
  IfcWindow: { name: 'Pencere', hint: 'Pencere.' },
  IfcCovering: { name: 'Kaplama / asma tavan', hint: 'Asma tavan, zemin veya duvar kaplaması.' },
  IfcMember: { name: 'Yapı parçası', hint: 'Dikme, kayıt gibi ikincil yapı parçası.' },
  IfcPlate: { name: 'Plaka', hint: 'Panel veya plaka (örn. cephe paneli).' },
  IfcRailing: { name: 'Korkuluk', hint: 'Korkuluk veya küpeşte.' },
  IfcStair: { name: 'Merdiven', hint: 'Merdiven.' },
  IfcStairFlight: { name: 'Merdiven kolu', hint: 'Merdivenin basamaklı kolu.' },
  IfcBuiltElement: { name: 'Yapı elemanı', hint: 'Duvar, döşeme, kiriş, kolon, kapı gibi yapı elemanlarının genel sınıfı (IFC4.3).' },
  IfcBuildingElement: { name: 'Yapı elemanı', hint: 'Duvar, döşeme, kiriş, kolon, kapı gibi yapı elemanlarının genel sınıfı (IFC2x3/IFC4).' },
  IfcElement: { name: 'Eleman', hint: 'Tüm fiziksel elemanların genel sınıfı.' },
  IfcDistributionElement: { name: 'Tesisat elemanı', hint: 'Tüm mekanik, elektrik ve sıhhi tesisat elemanlarının genel sınıfı.' },
  IfcBuildingElementProxy: { name: 'Genel yapı elemanı', hint: 'Sınıfı belirtilmemiş yapı elemanı.' },
  IfcFlowSegment: { name: 'Tesisat hattı', hint: 'Kanal, boru veya kablo taşıyıcının düz parçası (IFC2x3 genel sınıfı).' },
  IfcDuctSegment: { name: 'Hava kanalı', hint: 'Havalandırma/iklimlendirme kanalının düz parçası.' },
  IfcPipeSegment: { name: 'Boru', hint: 'Su, atık su veya ısıtma borusunun düz parçası.' },
  IfcCableCarrierSegment: { name: 'Kablo taşıyıcı', hint: 'Kablo kanalı veya tava.' },
  IfcFlowFitting: { name: 'Tesisat bağlantı parçası', hint: 'Dirsek, T, redüksiyon gibi bağlantı parçası.' },
  IfcFlowTerminal: { name: 'Tesisat uç birimi', hint: 'Menfez, lavabo, armatür gibi uç birim.' },
  IfcAirTerminal: { name: 'Hava menfezi', hint: 'Hava giriş/çıkış menfezi.' },
  IfcDamper: { name: 'Damper', hint: 'Kanal içinde akışı kesen kapak; yangın damperi yangında kapanır.' },
  IfcFlowController: { name: 'Akış kontrol elemanı', hint: 'Vana, damper gibi akışı kontrol eden eleman.' },
  IfcSpace: { name: 'Mahal', hint: 'Oda veya hacim.' },
  IfcBuildingStorey: { name: 'Kat', hint: 'Bina katı.' },
};

export function turkishClassName(ifcClass: string): string {
  return NAMES[ifcClass]?.name ?? ifcClass;
}

export function classHint(ifcClass: string): string {
  const entry = NAMES[ifcClass];
  return entry ? `${entry.hint} (IFC sınıfı: ${ifcClass})` : `IFC sınıfı: ${ifcClass}`;
}
