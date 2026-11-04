<p align="center">
  <img src="public/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">Fatura Lens</h1>

<p align="center">
  <strong>Bir klasör dolusu e-faturayı bırakın. Toplamlar, KDV dağılımı ve tüm tutarsızlıklar saniyeler içinde önünüzde.</strong><br>
  e-Fatura, e-Arşiv ve e-İrsaliye (UBL-TR) XML dosyaları için açık kaynak, çevrim dışı okuyucu.
</p>

<p align="center">
  <a href="https://harunnkcnn.github.io/fatura-lens/"><b>Canlı demo</b></a> ·
  <a href="README.md">English</a> ·
  <a href="#özellikler">Özellikler</a> ·
  <a href="#gizlilik">Gizlilik</a> ·
  <a href="#kendiniz-çalıştırın">Kendiniz çalıştırın</a>
</p>

<p align="center">
  <a href="https://github.com/harunnkcnn/fatura-lens/actions/workflows/ci.yml"><img src="https://github.com/harunnkcnn/fatura-lens/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/lisans-MIT-5b3fc4" alt="MIT lisansı"></a>
  <img src="https://img.shields.io/badge/veri-cihazdan%20%C3%A7%C4%B1kmaz-1f7a4d" alt="Veri cihazdan çıkmaz">
</p>

<p align="center">
  <a href="docs/assets/demo.mp4"><img src="docs/assets/demo.gif" width="860" alt="Örnek faturaların yüklenmesi, sorunlu belgelerin filtrelenmesi, kontrollerin ve orijinal görünümün açılması"></a>
</p>

## Neden

Her ay muhasebeciler, KOBİ'ler ve lojistik ekipleri entegratörden ya da GİB portalından ZIP dolusu XML indiriyor, sonra tutarları kontrol etmek için **tek tek** açıyor. Excel'e elle yazılıyor. Yanlış VKN, tutmayan satır toplamı, unutulmuş tevkifat kırılımı gibi hatalar geç fark ediliyor ya da hiç fark edilmiyor.

Fatura Lens hepsini birden, tamamen tarayıcınızda okur:

- **Yükleme yok, hesap yok, sunucu yok.** Faturalar ticari sır ve kişisel veri içerir; cihazınızdan çıkmaz.
- **Tarayıcıların XSLT desteğini bırakmasından etkilenmez.** Chrome [17 Kasım 2026'da XSLT çalıştırmayı durduruyor](https://developer.chrome.com/docs/web-platform/deprecating-xslt); Firefox ve Safari de aynı yolda. Web tabanlı birçok e-fatura görüntüleyici sessizce bozulacak. Fatura Lens yerleşik motor varken onu kullanır, yoksa libxslt'nin WebAssembly derlemesine geçer; faturanın kendi resmi görünümü çalışmaya devam eder.

## Özellikler

| | |
|---|---|
| **Toplu içe aktarma** | `.xml` ve `.zip` dosyalarını karışık sürükleyin (iç içe ZIP ve GİB zarfları dahil). Aynı dosyaları tekrar eklemek toplamları ikiye katlamaz. |
| **Para birimine saygılı toplamlar** | Matrah, KDV, tevkifat, vergiler dahil ve ödenecek tutar, her para birimi için ayrı. TL asla EUR ile toplanmaz. Hesaplar kuruş cinsinden tam sayıyla yapılır; 2.000 faturada bile kayma olmaz. |
| **Oranlara göre KDV** | %20 / %10 / %1 / %0 kırılımı matrah ve vergisiyle; aylık KDV beyannamesini hazırlarken işinize yarar. |
| **Gelen / giden** | Kendi VKN/TCKN'nizi bir kez girin; her belge etiketlenir ve filtrelenebilir. |
| **Orijinal görünüm** | Her faturanın içine gömülü şablonu (XSLT) işler; düzenleyenin tasarladığı görünüm. Yazdırmaya hazır. |
| **e-İrsaliye** | Plaka, dorse plakası, şoför, taşıyıcı ve sevk edilen miktarlar. |
| **Hızlı kontroller** | Bozuk ETTN, numara/tarih yıl uyumsuzluğu, VKN/TCKN kontrol hanesi hatası, tutmayan satır toplamı, vergi toplamı ile alt kırılım farkı, `TEVKIFAT` tipinde eksik tevkifat, farklı içerikle tekrar eden ETTN. |
| **Excel'e aktarma** | Belgeler ve satırlar CSV olarak; Türkçe Excel için `;` ayraç ve virgüllü ondalık. Formül enjeksiyonuna karşı korumalı. |
| **Her şeyde arama** | Belge no, firma, VKN, ETTN, ürün adı, plaka, şoför. Aramaya geçmek için `/` tuşu. |
| **Türkçe ve İngilizce** | İki dilde tam arayüz, açık/koyu tema, klavyeyle kullanılabilir, telefonda çalışır. |

<table>
  <tr>
    <td><img src="docs/assets/overview-tr.png" alt="Para birimine göre dip toplam, kontrol mührü ve belge tablosu"></td>
    <td><img src="docs/assets/original-view-tr.png" alt="Gömülü şablonuyla işlenmiş bir fatura"></td>
  </tr>
  <tr>
    <td align="center">Para birimine göre dip toplam, oranlara göre KDV, her belgenin durumu</td>
    <td align="center">Faturanın kendi görünümü, yerelde ve izole ortamda</td>
  </tr>
</table>

<p align="center">
  <img src="docs/assets/mobile-dark.png" width="260" alt="Koyu temada mobil görünüm">
  <img src="docs/assets/mobile-checks-dark.png" width="260" alt="Mobilde hızlı kontroller">
</p>

## Gizlilik

- Dosyalar File API ile okunur, tarayıcının kendi `DOMParser`'ı ile ayrıştırılır. Arka uç yoktur.
- Sayfa katı bir Content-Security-Policy ile gelir (`connect-src 'self'`): uygulamanın kendisi verinizi hiçbir yere gönderemez.
- Fatura şablonları **script çalıştıramayan**, kendi CSP'si (`default-src 'none'`) olan izole bir iframe'de işlenir; kötü niyetli bir XSLT kod çalıştıramaz, izleme pikseli yükleyemez, ağa çıkamaz.
- Tarayıcıda yalnızca dil, tema ve girdiğiniz VKN/TCKN saklanır. Analitik yoktur.

## Kontroller ne yapar, ne yapmaz

Kontroller, insanların gerçekten yaptığı hataları yakalamak için hızlı sezgisel denetimlerdir. GİB'in XSD + şematron doğrulamasının **yerini tutmaz** ve dijital imzayı doğrulamaz. Tam şematron doğrulaması için [efatura-kontrol](https://pypi.org/project/efatura-kontrol/) aracına bakabilirsiniz.

## Kendiniz çalıştırın

Canlı demo, buradaki statik derlemenin aynısıdır. Gereksinim: Node.js 22+.

```bash
git clone https://github.com/harunnkcnn/fatura-lens.git
cd fatura-lens
npm ci
npm run dev        # http://localhost:5173
npm test           # ayrıştırıcı, kontroller, ZIP, CSV ve toplama testleri
npm run build      # statik dosyalar dist/ klasöründe
```

`dist/` düz statik dosyalardır. Herhangi bir web sunucusunda, şirket içi ağda ya da GitHub Pages'te barındırabilirsiniz. Alt dizinde yayınlamak için `VITE_BASE=/yolunuz/ npm run build`.

## Nasıl çalışır

```
 .xml / .zip ─▶ ingest.ts ─▶ parse.ts ─▶ checks.ts ─▶ aggregate.ts ─▶ React arayüz
   (fflate,       (kodlama,    (UBL-TR →    (bulgular)    (para birimine     │
    sınırlar)      zarflar)     tipli belge)               göre toplam)       ├─▶ csv.ts
                                                                              └─▶ xslt.ts (yerleşik → WASM)
```

- `src/lib/parse.ts`: ad alanından bağımsız UBL-TR okuyucu (`cbc:`, `n1:` ya da öneksiz).
- `src/lib/ingest.ts`: ZIP bombasına karşı sınırlarla açma (5.000 dosya, 500 MB, 2 seviye), BOM ve `ISO-8859-9` desteği.
- `src/lib/xslt.ts`: varsa yerleşik `XSLTProcessor`, yoksa [xslt-polyfill](https://github.com/mfreed7/xslt_polyfill) (WASM'a derlenmiş libxslt); yalnızca gerektiğinde yüklenir.
- `src/lib/samples.ts` içindeki tüm örnek belgeler kurgusaldır; firmalar ve numaralar gerçek değildir.

## Yol haritası

- [ ] Windows ve macOS masaüstü uygulaması (Tauri), klasör izleme ile
- [ ] Her para birimi için ayrı sayfalı gerçek `.xlsx` çıktısı
- [ ] Tamamen çevrim dışı kurulabilir PWA
- [ ] e-SMM ve e-Müstahsil desteği
- [ ] Aylık KDV beyannamesi yardımcısı

Fikirler ve gerçek hayattan uç durumlar [issue](https://github.com/harunnkcnn/fatura-lens/issues) olarak çok değerli. Lütfen asla gerçek fatura eklemeyin; bkz. [CONTRIBUTING](CONTRIBUTING.md).

## Lisans ve teşekkür

[MIT](LICENSE) © Harun. Gelir İdaresi Başkanlığı (GİB) ile bağı yoktur; "e-Fatura", "e-Arşiv" ve "e-İrsaliye" kamu hizmetlerinin adlarıdır. Üçüncü taraf bileşenler kendi lisanslarını korur; bkz. [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
