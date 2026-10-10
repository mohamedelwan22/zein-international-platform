/**
 * Approved profile content for the seed (SC-010, Constitution III).
 *
 * Pure data module — no side effects, no environment access — so unit tests
 * can assert the governance invariants (approved facts only) without a DB.
 *
 * Sources (sourceDoc on every seeded row):
 *   - docs/PROJECT_REQUIREMENTS.md (§§2, 4-7, 10-16, 26)
 *   - docs/English Profile.pdf (approved English profile)
 *   - docs/pre 7.pdf (approved Arabic profile)
 *
 * Explicitly NOT included (data-model.md §8, Constitution III):
 *   - coordinates or any location rows
 *   - statistics counters — including the "50 years of success" claim,
 *     which is NOT renderable until final client approval (FR-007)
 *   - brands, products, suppliers, clients (pending Open Items 4-5)
 *   - social links, working hours, privacy notice (pending client content)
 */

export const SOURCE_DOCS = {
  categories:
    "docs/PROJECT_REQUIREMENTS.md §7; docs/English Profile.pdf p.13; docs/pre 7.pdf p.13",
  categoriesExtra:
    "docs/PROJECT_REQUIREMENTS.md §7.5; docs/English Profile.pdf p.15; docs/pre 7.pdf p.15",
  contact:
    "docs/PROJECT_REQUIREMENTS.md §26; docs/English Profile.pdf p.16; docs/pre 7.pdf p.16",
  homeEn: "docs/PROJECT_REQUIREMENTS.md §10; docs/English Profile.pdf pp.2,8,9,10",
  homeAr: "docs/PROJECT_REQUIREMENTS.md §10; docs/pre 7.pdf pp.2,8,9,10",
  aboutEn: "docs/PROJECT_REQUIREMENTS.md §§5,11-16; docs/English Profile.pdf pp.2-12",
  aboutAr: "docs/PROJECT_REQUIREMENTS.md §§5,11-16; docs/pre 7.pdf pp.2-12",
} as const;

/** Opening statement of the approved story — used for hero + about preview. */
export const OPENING_EN =
  "Zain International Trade Agency is a leading Saudi institution in the field of trade and personal care established in 1394 AH, the institution imports high-quality products in the field of personal care and beauty.";
export const OPENING_AR =
  "وكالة زين للتجارة العالمية هي مؤسسة سعودية رائدة في مجال التجارة والعناية الشخصية تأسست في عام ١٣٩٤هـ، تستورد المؤسسة منتجات عالية الجودة في مجال العناية الشخصية والتجميل.";

export const GEOGRAPHIC_PRESENCE_EN =
  "We distribute our products all over the Kingdom and across borders, we have an extensive supply network of partners and agents to ensure that our products are available to customers around the world.";
export const GEOGRAPHIC_PRESENCE_AR =
  "نحن نوزع منتجاتنا في جميع أنحاء المملكة وعبر الحدود، نحن نمتلك شبكة إمداد وتموين واسعة من الشركاء والوكيلاء لضمان توفير منتجاتنا للعملاء حول العالم.";

export const MISSION_EN =
  "Our mission at Zain International Trade Agency is to take pride in service and achieve customer satisfaction. We are committed to importing high-quality products and always strive for improvement and development. The agency is built on trust and mutual respect between us and our customers, and we seek to enhance the beauty and confidence of our customers through our import of unique and international cosmetic products.";
export const MISSION_AR =
  "رسالتنا في وكالة زين للتجارة العالمية تتمحور حول الافتخار بالخدمة وتحقيق رضا العملاء، نحن نلتزم باستيراد منتجات عالية الجودة ونسعى دائماً للتحسين والتطوير، بُنيت الوكالة على الثقة والاحترام المتبادل بيننا وبين عملائنا، ونسعى لتعزيز جمال وثقة زبائننا من خلال استيرادنا لمنتجات تجميلية فريدة وعالمية.";

export const VISION_EN =
  "To become the main and reliable partner in the world of personal care and cosmetology, we strive to be the first and preferred choice of our customers when looking for high-quality cosmetic products and personal care supplies.";
export const VISION_AR =
  "أن نصبح الشريك الرئيسي والموثوق به في عالم العناية الشخصية والتجميل، نسعى جاهدين لنكون الخيار الأول والمفضل لعملائنا عند البحث عن منتجات تجميلية ومستلزمات العناية الشخصية ذات جودة عالية.";

export const SUSTAINABILITY_EN = [
  "We care about the environment and adhere to sustainable manufacturing practices, and this is fully consistent with the kingdom's Vision 2030, the vision of the kingdom comes as an ambitious vision aimed at achieving sustainable development and diversifying and increasing the Saudi economy, we strive to contribute to the achievement of this ambitious vision through our commitment to the environment and sustainability.",
  "We believe that sustainable work is not just a commitment to duty, it is an essential part of our role in achieving the kingdom's Vision 2030 through the use of environmentally friendly components and adherence to strict standards in the manufacture of our products, we strive to achieve a perfect balance between meeting customer needs and contributing to the achievement of the kingdom's vision of a clean and sustainable environment.",
  "We share the work with the kingdom's Vision 2030 in building a better future for all, and we look forward to further work and development towards achieving this ambitious vision that seeks to promote development and prosperity in the kingdom of Saudi Arabia.",
];
export const SUSTAINABILITY_AR = [
  "نهتم بالبيئة ونلتزم بممارسات تصنيع مستدامة، وهذا ينسجم تماماً مع رؤية المملكة ٢٠٣٠، تأتي رؤية المملكة كرؤية طموحة تهدف إلى تحقيق التنمية المستدامة وتنويع وزيادة الاقتصاد السعودي، نسعى للمساهمة في تحقيق هذه الرؤية الطموحة من خلال التزامنا بالبيئة والاستدامة.",
  "نؤمن بأن العمل المستدام ليس مجرد التزامٍ بالواجب، بل هو جزء أساسي من دورنا في تحقيق رؤية المملكة ٢٠٣٠ من خلال استخدام مكونات صديقة للبيئة والالتزام بمعايير صارمة في تصنيع منتجاتنا، نسعى لتحقيق توازن مثالي بين تلبية احتياجات العملاء والمساهمة في تحقيق رؤية المملكة لبيئة نظيفة ومستدامة.",
  "نشارك العمل مع رؤية المملكة ٢٠٣٠ في بناء مستقبل أفضل للجميع، ونتطلع إلى مزيد من العمل والتطور نحو تحقيق هذه الرؤية الطموحة التي تسعى إلى تعزيز التنمية وازدهار في المملكة العربية السعودية.",
];

export const INNOVATION_EN =
  "We believe in the importance of innovation and continuous development, and we strive to provide new and innovative products that meet the needs of the modern market and give customers a distinctive experience.";
export const INNOVATION_AR =
  "نحن نؤمن بأهمية الابتكار والتطوير المستمر، ونسعى لتقديم منتجات جديدة ومبتكرة تلبي احتياجات السوق العصري وتمنح العملاء تجربة مميزة.";

export interface SeedCategory {
  slugEn: string;
  slugAr: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  sortOrder: number;
  sourceDoc: string;
}

/** The five initial product categories (spec Key Entities / PROJECT_REQUIREMENTS §7). */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slugEn: "personal-care-cosmetic-accessories",
    slugAr: "mustalzamat-al-inaia-alshakhsia-wal-tajmil",
    nameEn: "Personal Care & Cosmetic Accessories",
    nameAr: "مستلزمات العناية الشخصية والتجميلية",
    descriptionEn:
      "We offer innovative products and tools for high-quality care.",
    descriptionAr: "نقدم منتجات وأدوات مبتكرة للعناية عالية الجودة.",
    sortOrder: 1,
    sourceDoc: SOURCE_DOCS.categories,
  },
  {
    slugEn: "baby-supplies",
    slugAr: "mustalzimat-al-ridhaa",
    nameEn: "Baby Supplies",
    nameAr: "مستلزمات الرضع",
    descriptionEn:
      "We provide a comprehensive range of baby products and baby supplies, including high-quality feeding bottles, sleeping and bathing supplies.",
    descriptionAr:
      "نوفر مجموعة شاملة من منتجات الرضع ومستلزمات الرضاعة، بما في ذلك زجاجات الرضاعة عالية الجودة ومستلزمات النوم والاستحمام.",
    sortOrder: 2,
    sourceDoc: SOURCE_DOCS.categories,
  },
  {
    slugEn: "sports-corsets-belts",
    slugAr: "al-mashadat-wal-ahzamat-al-riyadia",
    nameEn: "Sports Corsets & Belts",
    nameAr: "المشدات والأحزمة الرياضية",
    descriptionEn:
      "We have a premium range of sports corsets and belts that provide support and comfort during exercise.",
    descriptionAr:
      "لدينا مجموعة متميزة من المشدات والأحزمة الرياضية التي توفر الدعم والراحة أثناء ممارسة الرياضة.",
    sortOrder: 3,
    sourceDoc: SOURCE_DOCS.categories,
  },
  {
    slugEn: "compresses-quick-treatment",
    slugAr: "al-kamadat-wal-ilaj-al-sarie",
    nameEn: "Compresses & Quick Treatment",
    nameAr: "الكمادات والعلاج السريع",
    descriptionEn:
      "We offer a carefully selected selection of hygienic and therapeutic compresses for pain relief and stress relief.",
    descriptionAr:
      "نقدم مجموعة مختارة بعناية من الكمادات الصحية والعلاجية لتخفيف الألم وتسكين الضغط.",
    sortOrder: 4,
    sourceDoc: SOURCE_DOCS.categories,
  },
  {
    slugEn: "additional-personal-care-products",
    slugAr: "muntaajat-al-inaia-alshakhsia-al-idafia",
    nameEn: "Additional Personal-Care Products",
    nameAr: "منتجات العناية الشخصية الإضافية",
    descriptionEn:
      "Zain agency can offer a variety of personal care products to meet the different needs of customers in the field of personal care.",
    descriptionAr:
      "يمكن لوكالة زين أن تقدم مجموعة متنوعة من منتجات العناية الشخصية لتلبية احتياجات العملاء المختلفة في مجال العناية الشخصية.",
    sortOrder: 5,
    sourceDoc: SOURCE_DOCS.categoriesExtra,
  },
];

export const HOME_CONTENT_EN = {
  hero: {
    // Approved tagline (PROJECT_REQUIREMENTS §3.2) + approved opening statement.
    headline: "Saudi Authenticity international quality",
    supporting: OPENING_EN,
  },
  aboutPreview: { body: OPENING_EN },
  mission: { body: MISSION_EN },
  vision: { body: VISION_EN },
  geographicPresence: { body: GEOGRAPHIC_PRESENCE_EN },
  sustainability: { body: SUSTAINABILITY_EN[0] },
  innovation: { body: INNOVATION_EN },
  // No statistics are approved yet — the "50 years" claim stays unrendered (FR-007).
  statistics: [] as Array<{ label: string; value: string; approved: boolean }>,
};

export const HOME_CONTENT_AR = {
  hero: {
    headline: "أصالة سعودية بجودة عالمية",
    supporting: OPENING_AR,
  },
  aboutPreview: { body: OPENING_AR },
  mission: { body: MISSION_AR },
  vision: { body: VISION_AR },
  geographicPresence: { body: GEOGRAPHIC_PRESENCE_AR },
  sustainability: { body: SUSTAINABILITY_AR[0] },
  innovation: { body: INNOVATION_AR },
  statistics: [] as Array<{ label: string; value: string; approved: boolean }>,
};

export const ABOUT_CONTENT_EN = {
  story: [
    "Zain International Trade Agency is a leading Saudi institution in the field of trade and personal care established in 1394 AH, the institution imports high-quality products in the field of personal care and beauty, and is working to expand and diversify its collection to meet the needs of local and international partners, Zain International Trade Agency always seeks to import international health and cosmetic supplies for the domestic market with high quality.",
    "Zain International Trade Agency was established as an exceptional Saudi brand, by a group of specialists in the field of trade and personal care, the main idea behind the establishment of the agency was to provide high-quality personal care and cosmetic supplies to customers locally and around the world, with excellence and pride in the originality of the Saudi brand.",
  ],
  history: [
    "Our exciting journey began in 1394 H, and since then, we have developed and expanded our range of products and services with confidence and commitment to our Saudi position and our position in the global personal care and cosmetic market. We cherish our Saudi origin and always strive to represent the kingdom in the best way by providing our products with high quality and distinctive service.",
    "Thanks to our remarkable integration into the global market, we contribute to enhancing the positive image of the Kingdom and strengthening local industries in the field of health supplies and cosmetics, Zain International Trade Agency reflects the dedication and uniqueness that characterizes Saudi projects and contribute to their development.",
  ],
  profile: [
    "Zain International Trade Agency is a leader in the field of personal care and cosmetic accessories and always strives to achieve excellence and uniqueness in this important sector, thanks to many years of experience and diligence, we managed to build a strong reputation and made our products widely available to customers.",
    "We understand that the needs of customers are diverse, which is why our diverse range of products targets a variety that suits the aspirations and needs of members of communities.",
    "The essence of our business lies in providing high quality products, we cooperate with the best brands and set strict standards to ensure that our products meet the expectations of quality and performance, our investment in research and development and the use of the latest technologies help us to stay on top of the competence.",
    "Over the years, we have built strong relationships with our partners and customers, we believe in the importance of partnership and joint cooperation to achieve success, customer satisfaction is our main goal, and we always strive to achieve this by providing excellent products and outstanding customer service.",
    "Zain International Trade Agency is committed to providing a comprehensive solution to customers' needs in the field of personal care and cosmetic accessories, and we look forward to continuing to excel and grow in this important field.",
  ],
  journey: [
    "Since the beginning of our journey, we have made our effort to provide the optimal choice of personal care and beauty supplies, as we always strive to achieve excellence and meet customer needs with high-quality products and exceptional service, and we always strive to move forward in our journey towards excellence.",
  ],
  mission: { body: MISSION_EN },
  vision: { body: VISION_EN },
  values: [
    {
      id: "quality",
      title: "Quality",
      description:
        "We are committed to providing high-quality products and services to our customers, ensuring that our products comply with the highest international standards and specifications.",
    },
    {
      id: "sustainability",
      title: "Sustainability",
      description:
        "We adhere to the concept of sustainability in all our operations, and we work hard to improve the quality of the services we provide to our customers, and this reflects our sustainability in the local market.",
    },
    {
      id: "transparency",
      title: "Transparency",
      description:
        "We believe in transparency and integrity in our relationship with our customers and partners, providing accurate and transparent information about our products and prices.",
    },
    {
      id: "commitment",
      title: "Commitment",
      description:
        "We are committed to achieving the highest standards of ethics in our daily work, and we respect the laws and regulations in the markets in which we operate.",
    },
    {
      id: "collaboration",
      title: "Collaboration",
      description:
        "We rely on strong cooperation and partnerships with our customers and suppliers, we strive to build sustainable relationships that benefit everyone.",
    },
    {
      id: "innovation",
      title: "Innovation",
      description:
        "Zain international trade agency adopts continuous innovation in the import of cosmetics and personal care supplies, as we always strive to bring unique and high-quality products that meet the needs and expectations of customers.",
    },
    {
      id: "customer-care",
      title: "Customer Care",
      description:
        "We are here to meet the needs of our customers with all attention, we fully understand that our customers are the core of our existence. We always strive to provide the best customer service and respond to all inquiries and feedback.",
    },
  ],
  sustainability: { paragraphs: SUSTAINABILITY_EN },
  innovation: { body: INNOVATION_EN },
};

export const ABOUT_CONTENT_AR = {
  story: [
    "وكالة زين للتجارة العالمية هي مؤسسة سعودية رائدة في مجال التجارة والعناية الشخصية تأسست في عام ١٣٩٤هـ، تستورد المؤسسة منتجات عالية الجودة في مجال العناية الشخصية والتجميل، وتعمل على توسيع وتنويع مجموعتها تلبية احتياجات الشركاء المحليين والعالميين، وتسعى وكالة زين للتجارة العالمية دائماً لاستيراد المستلزمات الصحية والتجميلية العالمية للسوق الداخلي بجودة عالية.",
    "تأسست وكالة زين للتجارة العالمية كعلامة سعودية استثنائية، بواسطة مجموعة من المتخصصين في مجال التجارة والعناية الشخصية، كانت الفكرة الأساسية وراء تأسيس الوكالة هي تقديم مستلزمات العناية الشخصية والتجميلية عالية الجودة إلى العملاء محلياً وحول العالم، مع التميز والفخر بأصالة العلامة السعودية.",
  ],
  history: [
    "بدأت رحلتنا المثيرة في ١٣٩٤هـ، ومنذ ذلك الحين قمنا بتطوير وتوسيع مجموعتنا من المنتجات والخدمات بثقة والتزام بمكانتنا السعودية ومكانتنا في سوق العناية الشخصية والتجميلية العالمي، نحن نعتز بأصالتنا السعودية ونسعى دائماً لتمثيل المملكة بأفضل صورة عبر تقديم منتجاتنا ذات الجودة العالية والخدمة المميزة.",
    "بفضل اندماجنا الرائع في السوق العالمي، نحن نساهم في تعزيز الصورة الإيجابية للمملكة وتعزيز الصناعات المحلية في مجال المستلزمات الصحية والمستحضرات التجميلية، وكالة زين للتجارة العالمية تعكس التفاني والتفرد الذي يميز المشروعات السعودية والمساهمة في تطويرها.",
  ],
  profile: [
    "وكالة زين للتجارة العالمية تعتبر رائدة في مجال مستلزمات العناية الشخصية والتجميلية وتسعى دائماً لتحقيق التميز والتفرد في هذا القطاع المهم، بفضل سنوات عديدة من الخبرة والاجتهاد، تمكنا من بناء سمعة قوية وجعلنا منتجاتنا متاحة على نطاق واسع للعملاء.",
    "نحن نتفهم أن احتياجات العملاء متنوعة، ولهذا فإن مجموعتنا المتنوعة من المنتجات تستهدف مجموعة متنوعة تناسب طموحات واحتياجات أفراد المجتمعات.",
    "جوهر عملنا يكمن في توفير منتجات ذات جودة عالية، نحن نتعاون مع أفضل العلامات التجارية ونضع معايير صارمة لضمان أن تلبي منتجاتنا توقعات الجودة والأداء، إن استثمارنا في البحث والتطوير واستخدام أحدث التقنيات يساعدنا على البقاء في مقدمة المنافسة.",
    "على مر السنوات، قمنا ببناء علاقات قوية مع شركائنا وعملائنا، نحن نؤمن بأهمية الشراكة والتعاون المشترك لتحقيق النجاح، رضا العملاء هو هدفنا الرئيسي ونسعى دائماً لتحقيق ذلك من خلال تقديم منتجات متميزة وخدمة عملاء متميزة.",
    "إن وكالة زين للتجارة العالمية تعبر عن التزامها بتقديم حل شامل لاحتياجات العملاء في مجال مستلزمات العناية الشخصية والتجميلية، ونتطلع إلى مواصلة التفوق والنمو في هذا المجال المهم.",
  ],
  journey: [
    "منذ بداية رحلتنا، بذلنا جهداً لتوفير الخيار الأمثل من مستلزمات العناية الشخصية والتجميل، حيث نسعى دائماً لتحقيق التميز وتلبية احتياجات العملاء بمنتجات عالية الجودة وخدمة استثنائية، ونسعى دائماً للمضي قدماً في رحلتنا نحو التميز.",
  ],
  mission: { body: MISSION_AR },
  vision: { body: VISION_AR },
  values: [
    {
      id: "quality",
      title: "الجودة",
      description:
        "نلتزم بتقديم منتجات وخدمات عالية الجودة لعملائنا، مع ضمان أن منتجاتنا تتوافق مع أعلى المعايير والمواصفات الدولية.",
    },
    {
      id: "sustainability",
      title: "الاستدامة",
      description:
        "نلتزم بمفهوم الاستدامة في جميع عملياتنا، ونعمل بجد على تحسين جودة الخدمات التي نقدمها لعملائنا، وهذا يعكس استدامتنا في السوق المحلي.",
    },
    {
      id: "transparency",
      title: "الشفافية",
      description:
        "نؤمن بالشفافية والنزاهة في علاقتنا مع عملائنا وشركائنا، حيث نقدم معلومات دقيقة وشفافة حول منتجاتنا وأسعارنا.",
    },
    {
      id: "commitment",
      title: "الالتزام",
      description:
        "نلتزم بتحقيق أعلى معايير الأخلاقيات في عملنا اليومي، ونحترم القوانين واللوائح في الأسواق التي نعمل بها.",
    },
    {
      id: "collaboration",
      title: "التعاون",
      description:
        "نعتمد على التعاون والشراكات القوية مع عملائنا وموردينا، نسعى لبناء علاقات مستدامة تعود بالفائدة على الجميع.",
    },
    {
      id: "innovation",
      title: "الابتكار",
      description:
        "وكالة زين للتجارة العالمية تتبنى الابتكار المستمر في استيراد المستحضرات التجميلية ومستلزمات العناية الشخصية، حيث نسعى دائماً لجلب منتجات فريدة وعالية الجودة تلبي احتياجات وتوقعات العملاء.",
    },
    {
      id: "customer-care",
      title: "الاهتمام بالعملاء",
      description:
        "نحن هنا لنلبي احتياجات عملائنا بكل اهتمام، نفهم تماماً أن عملاءنا جوهر وجودنا، ونسعى دائماً لتقديم أفضل خدمة عملاء والاستجابة لجميع الاستفسارات والملاحظات.",
    },
  ],
  sustainability: { paragraphs: SUSTAINABILITY_AR },
  innovation: { body: INNOVATION_AR },
};

export const CONTACT_INFO_EN = {
  country: "Saudi Arabia",
  city: "Jeddah",
  district: "Aziziyah District",
  address: "23337 King Fahd Road",
  phones: ["0126747594", "0126747595"],
  email: "ahmed@zainagency.com",
  website: "Zainagency.com",
  note: "Contact us for any inquiry or additional information. We are here to serve you.",
};

export const CONTACT_INFO_AR = {
  country: "السعودية",
  city: "جدة",
  district: "حي العزيزية",
  address: "23337 طريق الملك فهد",
  phones: ["0126747594", "0126747595"],
  email: "ahmed@zainagency.com",
  website: "Zainagency.com",
  note: "أتصل بنا لأي استفسار أو معلومات إضافية. نحن هنا لخدمتك",
};
