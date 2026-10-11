# Bölüm 3: Mekansal Akıl Yürütme ve Çakışma Denetimi (Spatial Audit)

*(Yapay Zeka Asistanı İçin Not: `src/audit/` altında geliştirilen geometri mantığını, SAT (Separating Axis Theorem) uygulamasını ve yönetmelik kurallarının kodlanmasını akademik bir dille buraya ekleyin.)*

## 3.1. Deterministik Mekansal Kesişim (Separating Axis Theorem)
İki bina elemanının (örneğin bir boru ve bir yangın duvarı) 3 boyutlu uzayda çakışıp çakışmadığını tespit etmek için Ayrıştırıcı Eksen Teoremi (Separating Axis Theorem - SAT) kullanılmıştır. $A$ ve $B$ kutularının tolerans $\epsilon$ ile kesişim koşulu şu şekilde formüle edilmiştir:
...

## 3.2. BYKHY 2015 Yangın Yönetmeliği Kurallarının Dijitalleştirilmesi
Sistemde uygulanan kurallar, salt metinden kodsal mantığa (logic rules) dönüştürülmüştür. Örneğin, Madde 51 gereği bir borunun (`IfcPipeSegment`) yangın duvarını (`IfcWall`) kesmesi durumunda, kesişim noktasında bir yangın damperi (`IfcDamper`) bulunması gerekliliği topolojik olarak doğrulanmaktadır...
