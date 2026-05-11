import type { InfoPageKey, Language, ScenarioOption, StatusLevel } from "./types";

type InfoContent = {
  eyebrow: string;
  title: string;
  summary: string;
  sections: Array<{ title: string; items: string[] }>;
};

type TextBundle = {
  app: {
    documentTitle: string;
    brand: string;
  };
  common: {
    close: string;
  };
  language: {
    label: string;
    english: string;
    turkish: string;
  };
  nav: Record<InfoPageKey, string>;
  controls: {
    title: string;
    subtitle: string;
    startLabel: string;
    endLabel: string;
    placeholder: string;
    chooseFromMap: string;
    selectedPrefix: string;
    noStart: string;
    noEnd: string;
    applyCoordinates: string;
    vehicleDemandLabel: string;
    vehicleDemandPlaceholder: string;
    vehicleDemandHint: string;
    scenarioSettings: string;
    scenarios: Record<ScenarioOption, string>;
    trafficLight: string;
    emergencyPriority: string;
    analyze: string;
    loading: string;
    reset: string;
  };
  errors: {
    invalidCoordinates: string;
    missingCoordinates: string;
    unexpected: string;
    apiConnection: string;
    apiNoResponse: string;
    osmUnavailable: string;
    routeNotFound: string;
    invalidDemand: string;
  };
  map: {
    start: string;
    end: string;
    newRoad: string;
    newRoadPlanned: string;
    newRoadFrom: string;
    newRoadTo: string;
    alternativeRoute: string;
    twoWay: string;
    oneWay: string;
    roadMatched: string;
    straightCandidate: string;
    signal: string;
    approaches: string;
    emergencyCorridor: string;
    minuteShort: string;
    legendMainRoute: string;
    legendAlternativeRoute: string;
    legendNewRoad: string;
    legendTrafficSignal: string;
    legendFree: string;
    legendModerate: string;
    legendHeavy: string;
    legendEmergency: string;
  };
  decision: {
    eyebrow: string;
    braessRisk: string;
    braessSafe: string;
    confidence: string;
    directionality: (oneWay: number, twoWay: number) => string;
    nextStep: string;
    signalStep: string;
    recommendedStep: string;
    scenarioVisual: string;
    reference: string;
    minuteShort: string;
  };
  metrics: {
    resultEyebrow: string;
    waitingTitle: string;
    waitingBody: string;
    braessLabel: string;
    present: string;
    absent: string;
    totalTime: string;
    averageDelay: string;
    congestion: string;
    recommended: string;
  };
  interventions: {
    newRoadTest: string;
    roadSelected: (direction: string) => string;
    start: string;
    end: string;
    length: string;
    trafficSignalTest: string;
    improvement: (minutes: string) => string;
    noCandidate: string;
    bestCandidate: (lat: string, lon: string) => string;
    noSignalBody: string;
    controlledApproaches: string;
    queueReduction: string;
    emergencyPriorityTest: string;
    emergencyImprovement: (minutes: string) => string;
    baseEta: string;
    priorityEta: string;
    affectedEdges: string;
    directionAnalysis: string;
    directedEdges: (count: number) => string;
    oneWay: string;
    twoWay: string;
    pairSuffix: string;
    demand: string;
    vehiclePerHour: string;
  };
  table: {
    title: string;
    scenario: string;
    time: string;
    delay: string;
    delta: string;
    congestion: string;
    status: string;
    intervention: string;
    report: string;
    reference: string;
    minuteShort: string;
  };
  status: Record<StatusLevel, string>;
  direction: {
    tek_yonlu: string;
    cift_yonlu: string;
  };
  info: Record<InfoPageKey, InfoContent>;
};

export const translations: Record<Language, TextBundle> = {
  en: {
    app: {
      documentTitle: "Braess Paradox Traffic Analysis",
      brand: "Braess Paradox Analysis"
    },
    common: {
      close: "Close"
    },
    language: {
      label: "Language",
      english: "EN",
      turkish: "TR"
    },
    nav: {
      documentation: "Documentation",
      methodology: "Methodology",
      about: "About"
    },
    controls: {
      title: "Control Panel",
      subtitle: "V1.0 Decision Support System",
      startLabel: "START POINT",
      endLabel: "DESTINATION POINT",
      placeholder: "Latitude, Longitude",
      chooseFromMap: "Select on Map",
      selectedPrefix: "Selected",
      noStart: "No start point selected",
      noEnd: "No destination point selected",
      applyCoordinates: "Apply Lat/Lon Input",
      vehicleDemandLabel: "TRAFFIC DEMAND",
      vehicleDemandPlaceholder: "Auto, or vehicles/hour",
      vehicleDemandHint: "Leave empty for automatic demand estimation.",
      scenarioSettings: "SCENARIO SETTINGS",
      scenarios: {
        mevcut_ag: "Current Network",
        yeni_yol_ekle: "Add New Road",
        yol_kapat: "Close Road"
      },
      trafficLight: "Traffic Signal",
      emergencyPriority: "Emergency Vehicle Priority",
      analyze: "Start Analysis",
      loading: "Calculating Simulation...",
      reset: "Reset"
    },
    errors: {
      invalidCoordinates: "Invalid coordinate format. Example: 40.4093, 49.8671",
      missingCoordinates: "Start and destination coordinates are required for analysis.",
      unexpected: "An unexpected error occurred.",
      apiConnection: "Could not connect to the simulation API. Please check Docker services.",
      apiNoResponse: "The simulation service did not respond.",
      osmUnavailable: "Could not connect to the OSM routing service.",
      routeNotFound: "No driving route was found.",
      invalidDemand: "Vehicle demand must be between 100 and 12000 vehicles/hour."
    },
    map: {
      start: "Start",
      end: "Destination",
      newRoad: "New road",
      newRoadPlanned: "New road will be added here",
      newRoadFrom: "New-road start",
      newRoadTo: "New-road end",
      alternativeRoute: "Alternative route on existing roads",
      twoWay: "two-way",
      oneWay: "one-way",
      roadMatched: "matched to OSM roads",
      straightCandidate: "engineering shortcut candidate",
      signal: "Signal",
      approaches: "approaches",
      emergencyCorridor: "Emergency corridor",
      minuteShort: "min",
      legendMainRoute: "Main route",
      legendAlternativeRoute: "Alternative route",
      legendNewRoad: "Tested new/alternative link",
      legendTrafficSignal: "Traffic signal candidate",
      legendFree: "Free Flow",
      legendModerate: "Moderate",
      legendHeavy: "Heavy",
      legendEmergency: "Emergency Priority"
    },
    decision: {
      eyebrow: "DECISION SUMMARY",
      braessRisk: "The new road looks risky",
      braessSafe: "No new-road crisis detected",
      confidence: "CONFIDENCE",
      directionality: (oneWay, twoWay) =>
        `${oneWay} one-way edges and ${twoWay} two-way links were considered.`,
      nextStep: "FIRST FIELD CHECK",
      signalStep: "This location produced the fastest signal-control improvement.",
      recommendedStep: "The model selected this scenario with the lowest average travel time.",
      scenarioVisual: "VISUAL SCENARIO COMPARISON",
      reference: "Baseline",
      minuteShort: "min"
    },
    metrics: {
      resultEyebrow: "ANALYSIS RESULT",
      waitingTitle: "Waiting for Analysis",
      waitingBody: "Choose a start and destination point, then click “Start Analysis”.",
      braessLabel: "Braess Paradox",
      present: "PRESENT",
      absent: "ABSENT",
      totalTime: "TOTAL TIME",
      averageDelay: "AVG. DELAY",
      congestion: "CONGESTION",
      recommended: "BEST RECOMMENDED SOLUTION"
    },
    interventions: {
      newRoadTest: "NEW ROAD TEST",
      roadSelected: (direction) => `${direction} connection selected`,
      start: "Start",
      end: "End",
      length: "Length",
      trafficSignalTest: "TRAFFIC SIGNAL TEST",
      improvement: (minutes) => `${minutes} min improvement`,
      noCandidate: "No suitable candidate",
      bestCandidate: (lat, lon) =>
        `The best candidate was tested at ${lat}, ${lon}.`,
      noSignalBody:
        "Bottleneck intensity was not strong enough to justify signal placement.",
      controlledApproaches: "Controlled approaches",
      queueReduction: "Queue reduction",
      emergencyPriorityTest: "EMERGENCY PRIORITY",
      emergencyImprovement: (minutes) => `${minutes} min faster ETA`,
      baseEta: "Base ETA",
      priorityEta: "Priority ETA",
      affectedEdges: "Affected edges",
      directionAnalysis: "DIRECTION ANALYSIS",
      directedEdges: (count) => `${count} directed edges`,
      oneWay: "One-way",
      twoWay: "Two-way",
      pairSuffix: "pairs",
      demand: "Demand",
      vehiclePerHour: "veh/hour"
    },
    table: {
      title: "Scenario Comparison",
      scenario: "Scenario",
      time: "Time",
      delay: "Delay",
      delta: "Delta",
      congestion: "Congestion",
      status: "Status",
      intervention: "Intervention",
      report: "HTML Report",
      reference: "Baseline",
      minuteShort: "min"
    },
    status: {
      Dusuk: "LOW",
      Orta: "MEDIUM",
      Yuksek: "HIGH"
    },
    direction: {
      tek_yonlu: "One-way",
      cift_yonlu: "Two-way"
    },
    info: {
      documentation: {
        eyebrow: "USER GUIDE",
        title: "Documentation",
        summary:
          "This panel explains how to analyze traffic-network scenarios between two points selected on the map.",
        sections: [
          {
            title: "Analysis flow",
            items: [
              "Select the start and destination on the map, or enter them as latitude/longitude.",
              "Choose scenario settings: new road, road closure, traffic signal, or emergency vehicle priority.",
              "Start Analysis fetches OSRM route data and sends it to the API for traffic assignment.",
              "The result cards answer whether Braess paradox exists, which scenario performs best, and where field teams should look first."
            ]
          },
          {
            title: "Map markers",
            items: [
              "The green marker shows the start point; the red marker shows the destination.",
              "The blue solid line is the main OSRM route.",
              "The blue-green dashed line is the alternative route on existing roads.",
              "The orange line is the tested new/alternative connection; when possible it follows OSRM road geometry.",
              "Green circles show tested traffic-signal candidate locations, and the black/yellow line marks emergency priority."
            ]
          }
        ]
      },
      methodology: {
        eyebrow: "CALCULATION METHODOLOGY",
        title: "Methodology",
        summary:
          "The model converts route geometry into a directed traffic graph and compares each scenario under the same demand assumption.",
        sections: [
          {
            title: "Model structure",
            items: [
              "OSRM route geometry and step-level road data are split into directed segments.",
              "Estimated speed, capacity, and signal delay are calculated for each segment.",
              "The BPR cost function increases travel time as segment utilization rises.",
              "A Wardrop-equilibrium style assignment iteratively distributes drivers toward the most attractive routes."
            ]
          },
          {
            title: "Scenario tests",
            items: [
              "The candidate new road is tested separately as one-way and two-way.",
              "Braess paradox is flagged when adding the new road makes average total time worse than the baseline.",
              "Traffic-signal candidates are selected from the strongest bottleneck nodes and simulated one by one.",
              "The road-closure test checks whether removing an overloaded link improves the network balance."
            ]
          }
        ]
      },
      about: {
        eyebrow: "ABOUT THE PROJECT",
        title: "About",
        summary:
          "The Braess Paradox Analysis Platform is a decision-support prototype that makes road-addition and road-closure impacts easier to understand.",
        sections: [
          {
            title: "Purpose",
            items: [
              "Turn traffic-engineering concepts into readable map-based visuals.",
              "Test the common assumption that adding a road always improves traffic.",
              "Give non-technical users a clear decision summary, confidence score, and field recommendation."
            ]
          },
          {
            title: "Limitations",
            items: [
              "This is an analytical prototype, not an official municipal decision system.",
              "Final decisions require calibration with live traffic, signal timing, lane count, and local demand measurements.",
              "OpenStreetMap and OSRM data may be incomplete or outdated depending on the area."
            ]
          }
        ]
      }
    }
  },
  tr: {
    app: {
      documentTitle: "Braess Paradoksu Trafik Analizi",
      brand: "Braess Paradoksu Analizi"
    },
    common: {
      close: "Kapat"
    },
    language: {
      label: "Dil",
      english: "EN",
      turkish: "TR"
    },
    nav: {
      documentation: "Dokümantasyon",
      methodology: "Metodoloji",
      about: "Hakkında"
    },
    controls: {
      title: "Kontrol Paneli",
      subtitle: "V1.0 Karar Destek Sistemi",
      startLabel: "BAŞLANGIÇ NOKTASI",
      endLabel: "VARIŞ NOKTASI",
      placeholder: "Enlem, Boylam",
      chooseFromMap: "Haritadan Seç",
      selectedPrefix: "Seçili",
      noStart: "Seçili başlangıç yok",
      noEnd: "Seçili varış yok",
      applyCoordinates: "Lat/Lon Girişini Uygula",
      vehicleDemandLabel: "TRAFİK TALEBİ",
      vehicleDemandPlaceholder: "Otomatik veya araç/saat",
      vehicleDemandHint: "Boş bırakırsanız talep otomatik tahmin edilir.",
      scenarioSettings: "SENARYO AYARLARI",
      scenarios: {
        mevcut_ag: "Mevcut Ağ",
        yeni_yol_ekle: "Yeni Yol Ekle",
        yol_kapat: "Yol Kapat"
      },
      trafficLight: "Trafik Lambası",
      emergencyPriority: "Acil Araç Önceliği",
      analyze: "Analizi Başlat",
      loading: "Simülasyon Hesaplanıyor...",
      reset: "Sıfırla"
    },
    errors: {
      invalidCoordinates: "Koordinat formatı geçersiz. Örnek: 40.4093, 49.8671",
      missingCoordinates: "Analiz için başlangıç ve varış koordinatları zorunludur.",
      unexpected: "Beklenmeyen hata oluştu.",
      apiConnection:
        "Simülasyon API'sine bağlanılamadı. Docker servislerini kontrol edin.",
      apiNoResponse: "Simülasyon servisi yanıt vermedi.",
      osmUnavailable: "OSM rota servisine bağlanılamadı.",
      routeNotFound: "Rota bulunamadı.",
      invalidDemand: "Araç talebi 100 ile 12000 araç/saat arasında olmalıdır."
    },
    map: {
      start: "Başlangıç",
      end: "Varış",
      newRoad: "Yeni yol",
      newRoadPlanned: "Yeni yol buraya eklenecek",
      newRoadFrom: "Yeni yol baslangici",
      newRoadTo: "Yeni yol bitisi",
      alternativeRoute: "Mevcut yollardan alternatif rota",
      twoWay: "çift yönlü",
      oneWay: "tek yönlü",
      roadMatched: "OSM yollarina uyarlandi",
      straightCandidate: "muhendislik kisayol adayi",
      signal: "Işık",
      approaches: "yaklaşım",
      emergencyCorridor: "Acil koridor",
      minuteShort: "dk",
      legendMainRoute: "Ana rota",
      legendAlternativeRoute: "Alternatif rota",
      legendNewRoad: "Test edilen yeni/alternatif baglanti",
      legendTrafficSignal: "Trafik lambasi adayi",
      legendFree: "Akıcı",
      legendModerate: "Orta",
      legendHeavy: "Yoğun",
      legendEmergency: "Acil Öncelik"
    },
    decision: {
      eyebrow: "KARAR ÖZETİ",
      braessRisk: "Yeni yol riskli görünüyor",
      braessSafe: "Yeni yol krizi görünmüyor",
      confidence: "GÜVEN",
      directionality: (oneWay, twoWay) =>
        `${oneWay} tek yönlü kenar, ${twoWay} çift yönlü bağlantı dikkate alındı.`,
      nextStep: "SAHADA İLK BAKILACAK NOKTA",
      signalStep: "Bu noktada sinyal düzeni testi en hızlı iyileşmeyi verdi.",
      recommendedStep: "Model bu senaryoyu en düşük ortalama süreyle seçti.",
      scenarioVisual: "SENARYOLARIN GÖRSEL KARŞILAŞTIRMASI",
      reference: "Referans",
      minuteShort: "dk"
    },
    metrics: {
      resultEyebrow: "ANALİZ SONUCU",
      waitingTitle: "Analiz Bekleniyor",
      waitingBody: "Başlangıç ve varış seçip “Analizi Başlat” butonuna tıklayın.",
      braessLabel: "Braess Paradoksu",
      present: "VAR",
      absent: "YOK",
      totalTime: "TOPLAM SÜRE",
      averageDelay: "ORT. GECİKME",
      congestion: "YOĞUNLUK",
      recommended: "ÖNERİLEN EN İYİ ÇÖZÜM"
    },
    interventions: {
      newRoadTest: "YENİ YOL TESTİ",
      roadSelected: (direction) => `${direction} bağlantı seçildi`,
      start: "Başlangıç",
      end: "Bitiş",
      length: "Uzunluk",
      trafficSignalTest: "TRAFİK IŞIĞI TESTİ",
      improvement: (minutes) => `${minutes} dk iyileşme`,
      noCandidate: "Uygun aday yok",
      bestCandidate: (lat, lon) =>
        `En iyi aday ${lat}, ${lon} noktasında test edildi.`,
      noSignalBody:
        "Darboğaz yoğunluğu ışık yerleşimi için yeterli sinyal vermedi.",
      controlledApproaches: "Kontrollü yaklaşım",
      queueReduction: "Kuyruk azalımı",
      emergencyPriorityTest: "ACİL ARAÇ ÖNCELİĞİ",
      emergencyImprovement: (minutes) => `${minutes} dk daha hızlı ETA`,
      baseEta: "Normal ETA",
      priorityEta: "Öncelikli ETA",
      affectedEdges: "Etkilenen kenar",
      directionAnalysis: "YÖN ANALİZİ",
      directedEdges: (count) => `${count} yönlü kenar`,
      oneWay: "Tek yönlü",
      twoWay: "Çift yönlü",
      pairSuffix: "çift",
      demand: "Talep",
      vehiclePerHour: "araç/saat"
    },
    table: {
      title: "Senaryo Karşılaştırması",
      scenario: "Senaryo",
      time: "Süre",
      delay: "Gecikme",
      delta: "Fark",
      congestion: "Yoğunluk",
      status: "Durum",
      intervention: "Müdahale",
      report: "HTML Rapor",
      reference: "Referans",
      minuteShort: "dk"
    },
    status: {
      Dusuk: "DÜŞÜK",
      Orta: "ORTA",
      Yuksek: "YÜKSEK"
    },
    direction: {
      tek_yonlu: "Tek yönlü",
      cift_yonlu: "Çift yönlü"
    },
    info: {
      documentation: {
        eyebrow: "KULLANIM REHBERİ",
        title: "Dokümantasyon",
        summary:
          "Bu panel, harita üzerinde seçilen iki nokta arasında trafik ağı senaryolarını analiz etmek için tasarlandı.",
        sections: [
          {
            title: "Analiz akışı",
            items: [
              "Başlangıç ve varış noktasını haritadan seçin veya enlem/boylam olarak girin.",
              "Senaryo ayarlarını belirleyin: yeni yol, yol kapatma, trafik lambası veya acil araç önceliği.",
              "Analizi Başlat butonu ile OSRM rota verisi alınır ve API tarafında trafik ataması hesaplanır.",
              "Sonuç kartları Braess paradoksu var mı, en iyi çözüm nedir ve sahada ilk nereye bakılmalı sorularını yanıtlar."
            ]
          },
          {
            title: "Harita işaretleri",
            items: [
              "Yeşil marker başlangıç noktasını, kırmızı marker varış noktasını gösterir.",
              "Mavi düz çizgi ana OSRM rotasını gösterir.",
              "Mavi-yeşil kesik çizgi mevcut yollardan alternatif rotadır.",
              "Turuncu çizgi test edilen yeni/alternatif bağlantıdır; mümkün olduğunda OSRM yol geometrisini izler.",
              "Yeşil daireler trafik lambası adaylarını, siyah/sarı çizgi acil öncelik koridorunu gösterir."
            ]
          }
        ]
      },
      methodology: {
        eyebrow: "HESAPLAMA METODOLOJİSİ",
        title: "Metodoloji",
        summary:
          "Model, rota geometrisini yönlü bir trafik grafına dönüştürür ve her senaryoyu aynı talep varsayımı altında karşılaştırır.",
        sections: [
          {
            title: "Model yapısı",
            items: [
              "OSRM rota geometrisi ve adım bazlı yol verisi segmentlere ayrılır.",
              "Her segment için tahmini hız, kapasite ve sinyal gecikmesi hesaplanır.",
              "BPR maliyet fonksiyonu ile yoğunluk arttıkça seyahat süresi artırılır.",
              "Wardrop denge yaklaşımı ile sürücülerin en cazip rotalara dağılımı iteratif olarak hesaplanır."
            ]
          },
          {
            title: "Senaryo testleri",
            items: [
              "Yeni yol hem tek yönlü hem çift yönlü olarak ayrı ayrı denenir.",
              "Braess paradoksu, yeni yol eklendiğinde toplam ortalama süre referans ağdan kötü olursa işaretlenir.",
              "Trafik lambası adayları en yoğun darboğaz düğümlerinden seçilir ve her aday yeniden simüle edilir.",
              "Yol kapatma testi, çok yüklenen ve ağı kötüleştiren bağlantıların kapatılması halinde dengeyi kontrol eder."
            ]
          }
        ]
      },
      about: {
        eyebrow: "PROJE HAKKINDA",
        title: "Hakkında",
        summary:
          "Braess Paradoksu Analiz Platformu, yol ekleme/kapama kararlarının trafik ağına etkisini daha okunabilir hale getiren bir karar destek prototipidir.",
        sections: [
          {
            title: "Amaç",
            items: [
              "Trafik mühendisliği kavramlarını harita üzerinde anlaşılır görsellere çevirmek.",
              "Yeni yol eklemek her zaman iyileştirme getirir varsayımını test etmek.",
              "Teknik olmayan kullanıcılar için karar özeti, güven skoru ve saha önerisi sunmak."
            ]
          },
          {
            title: "Sınırlar",
            items: [
              "Bu uygulama resmi belediye karar sistemi değil, analitik bir prototiptir.",
              "Son kararlar için canlı trafik verisi, sinyal süreleri, şerit sayıları ve yerel talep ölçümü ile kalibrasyon gerekir.",
              "OpenStreetMap ve OSRM verileri bölgeye göre eksik veya güncel olmayabilir."
            ]
          }
        ]
      }
    }
  }
};

export function getTexts(language: Language): TextBundle {
  return translations[language];
}
