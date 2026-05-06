export type InfoPageKey = "documentation" | "methodology" | "about";

type Props = {
  activePage: InfoPageKey | null;
  onClose: () => void;
};

const content: Record<
  InfoPageKey,
  {
    eyebrow: string;
    title: string;
    summary: string;
    sections: Array<{ title: string; items: string[] }>;
  }
> = {
  documentation: {
    eyebrow: "KULLANIM REHBERI",
    title: "Dokumantasyon",
    summary:
      "Bu panel, harita uzerinde secilen iki nokta arasinda trafik agi senaryolarini analiz etmek icin tasarlandi.",
    sections: [
      {
        title: "Analiz akisi",
        items: [
          "Baslangic ve varis noktasini haritadan secin veya enlem/boylam olarak girin.",
          "Senaryo ayarlarini belirleyin: yeni yol, yol kapatma, trafik lambasi veya acil arac onceligi.",
          "Analizi Baslat butonu ile OSRM rota verisi alinir ve API tarafinda trafik atamasi hesaplanir.",
          "Sonuc kartlari Braess paradoksu var mi, en iyi cozum nedir ve sahada ilk nereye bakilmali sorularini yanitlar."
        ]
      },
      {
        title: "Harita isaretleri",
        items: [
          "Yesil marker baslangic noktasini, kirmizi marker varis noktasini gosterir.",
          "Kalin rota cizgisi aktif senaryo rotasini temsil eder.",
          "Turuncu cizgi test edilen yeni yol adayini gosterir.",
          "Yesil daireler test edilen trafik lambasi aday noktalaridir."
        ]
      }
    ]
  },
  methodology: {
    eyebrow: "HESAPLAMA METODOLOJISI",
    title: "Metodoloji",
    summary:
      "Model, rota geometrisini yonlu bir trafik grafina donusturur ve her senaryoyu ayni talep varsayimi altinda karsilastirir.",
    sections: [
      {
        title: "Model yapisi",
        items: [
          "OSRM rota geometrisi ve adim bazli yol verisi segmentlere ayrilir.",
          "Her segment icin tahmini hiz, kapasite ve sinyal gecikmesi hesaplanir.",
          "BPR maliyet fonksiyonu ile yogunluk arttikca seyahat suresi artirilir.",
          "Wardrop denge yaklasimi ile suruculerin en cazip rotalara dagilimi iteratif olarak hesaplanir."
        ]
      },
      {
        title: "Senaryo testleri",
        items: [
          "Yeni yol hem tek yonlu hem cift yonlu olarak ayri ayri denenir.",
          "Braess paradoksu, yeni yol eklendiginde toplam ortalama sure referans agdan kotu olursa isaretlenir.",
          "Trafik lambasi adaylari en yogun darbogaz dugumlerinden secilir ve her aday yeniden simule edilir.",
          "Yol kapatma testi, cok yuklenen ve agi kotulestiren baglantilarin kapatilmasi halinde dengeyi kontrol eder."
        ]
      }
    ]
  },
  about: {
    eyebrow: "PROJE HAKKINDA",
    title: "Hakkinda",
    summary:
      "Braess Paradoksu Analiz Platformu, yol ekleme/kapama kararlarinin trafik agina etkisini daha okunabilir hale getiren bir karar destek prototipidir.",
    sections: [
      {
        title: "Amac",
        items: [
          "Trafik muhendisligi kavramlarini harita uzerinde anlasilir gorsellere cevirmek.",
          "Yeni yol eklemek her zaman iyilestirme getirir varsayimini test etmek.",
          "Teknik olmayan kullanicilar icin karar ozeti, guven skoru ve saha onerisi sunmak."
        ]
      },
      {
        title: "Sinirlar",
        items: [
          "Bu uygulama resmi belediye karar sistemi degil, analitik bir prototiptir.",
          "Son kararlar icin canli trafik verisi, sinyal sureleri, serit sayilari ve yerel talep olcumu ile kalibrasyon gerekir.",
          "OpenStreetMap ve OSRM verileri bolgeye gore eksik veya guncel olmayabilir."
        ]
      }
    ]
  }
};

export function InfoPanel({ activePage, onClose }: Props) {
  if (!activePage) return null;

  const page = content[activePage];

  return (
    <section className="info-panel">
      <div className="info-panel-header">
        <div>
          <span>{page.eyebrow}</span>
          <h2>{page.title}</h2>
          <p>{page.summary}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Bilgi panelini kapat">
          Kapat
        </button>
      </div>

      <div className="info-sections">
        {page.sections.map((section) => (
          <article key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

