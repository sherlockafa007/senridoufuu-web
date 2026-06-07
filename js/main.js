/* ============================================================
   千里同風株式会社 — Main JavaScript
   i18n | Navigation | Scroll Animations
   ============================================================ */

/* === TRANSLATION DATA === */
const T = {
  ja: {
    /* Navigation */
    nav_about:        '私たちについて',
    nav_team:         'チーム',
    nav_milestones:   '沿革',
    nav_solutions:    'ソリューション',
    nav_products:     '製品',
    nav_demo:         'オンラインデモ',
    nav_blog:         'ブログ',

    /* Hero */
    hero_corp:        '千里同風株式会社',
    hero_tagline:     '人間がAIとの寄り添いを求めるすべての願いは、魂の共鳴への渇望にほかならない。',
    hero_scroll:      'scroll',

    /* Mission */
    mission_eyebrow:  'ミッション',
    mission_title:    'AIとハードウェアの融合を通じて、人と技術の距離を縮める。',
    mission_body:     '私たちは、生成AIをハードウェアに組み込むことで、温かみと知性を持つ製品を生み出します。技術は人間のためにある——その信念のもと、日本市場に向けたプロダクト企画・開発を行っています。',

    /* Vision */
    vision_eyebrow:   'ビジョン',
    vision_title:     '温かみのあるAIが、人々の日常に静かに溶け込む世界を創る。',
    vision_body:      'おもちゃ、教具、IoTデバイスを通じて、人とAIの新しい関係性を探求する。それが私たちの目指す未来です。',

    /* Values */
    values_eyebrow:   '価値観',
    values_title:     '技術は人間のために',
    val1_name:        'リアリズム',
    val1_desc:        '現実に根ざした企画と実行。理想を掲げながらも、実現可能な道筋を誠実に追い求めます。',
    val2_name:        '明確さ',
    val2_desc:        '複雑な技術を、誰もが理解できる言葉と形に変える。明確なコミュニケーションが信頼の土台です。',
    val3_name:        '責任',
    val3_desc:        'テクノロジーの力を持つ者が、その使い方に責任を持つ。私たちはAIの倫理的活用にコミットします。',

    /* About teaser (homepage) */
    about_teaser_eyebrow: '千里同風とは',
    about_teaser_title:   '大阪から、AIと人をつなぐ新しい形を探して。',
    about_teaser_body:    '千里同風株式会社は、生成AI搭載ハードウェアの研究・企画に特化した会社です。市場調査から製品コンセプト開発まで、一貫したサポートを提供します。',
    about_teaser_cta:     'チームを見る',

    nav_member:            'メンバー',

    /* Footer */
    footer_tagline:        '人間がAIとの寄り添いを求めるすべての願いは、魂の共鳴への渇望にほかならない。',
    footer_nav_heading:    'ナビゲーション',
    footer_contact_heading:'お問い合わせ',
    footer_copy:           '© 2024 千里同風株式会社',
    addr_street:           '大阪府大阪市淀川区西三国4丁目4-9-7',
    addr_city:             '大阪市, 日本',

    /* Team page */
    team_page_title:      '千里同風株式会社 — チーム',
    team_eyebrow:         'チーム',
    team_title:           '私たちのチーム',
    team_body:            '少数精鋭で、AIとハードウェアの未来を切り拓いています。',
    team1_role:           '代表取締役',
    team1_bio:            '千里同風株式会社の代表。生成AIを活用したハードウェア製品の事業開発・市場開拓を主導。日本市場向けのAI製品企画・サプライチェーン構築に注力しています。',
    team2_role:           'ビジネスアドバイザー',
    team2_bio:            '中国公認会計士（CPA）。財務戦略・クロスボーダービジネスのアドバイザリーを担当。中日間のビジネス開発および財務管理をサポートします。',

    /* Milestones page */
    milestones_page_title: '千里同風株式会社 — 沿革',
    milestones_eyebrow:   '沿革',
    milestones_title:     '会社の歩み',
    milestones_body:      '千里同風株式会社の設立から現在までの歩みをご覧ください。',
    ms1_event:            '千里同風株式会社 設立',
    ms1_desc:             '大阪市にて設立。生成AI搭載ハードウェアの研究・企画に特化した会社として始動。',
    ms2_event:            '市場調査・製品企画 開始',
    ms2_desc:             '日本市場向け生成AIハードウェア製品の調査・コンセプト開発を開始。教育・医療・家電・公共サービス分野での可能性を探求。',
    ms3_event:            '公式ウェブサイト 公開',
    ms3_desc:             '千里同風株式会社の公式ウェブサイトをリニューアルし、会社のビジョンとサービスを世界に向けて発信。',

    /* Solutions page */
    solutions_page_title: '千里同風株式会社 — ソリューション',
    solutions_eyebrow:    'ソリューション',
    solutions_title:      '製品・サービス',
    solutions_body:       '生成AIとハードウェアを融合させた、新しいカテゴリの製品群。教育・IoT・エンターテインメント分野で、人とAIの新しい関係性を提案します。',
    services_eyebrow:     'サービス',
    services_title:       '私たちが提供すること',
    srv1_name:            '市場・業界調査',
    srv1_desc:            'クロスボーダー分析、競合評価、ユーザーインサイト。日本市場の深い理解に基づいた調査を提供します。',
    srv2_name:            '製品企画・市場参入支援',
    srv2_desc:            'サプライチェーン調査、ユーザースタディ、コンセプト開発、パートナーシップ促進まで、一貫してサポートします。',
    srv3_name:            'AI統合ハードウェア開発',
    srv3_desc:            '生成AI・画像認識・音声インターフェースを組み込んだハードウェア製品の企画・プロトタイピング支援。',
    coming_soon:          '近日公開',
    product1_category:    '教育向け',
    product1_name:        'AI学習デバイス',
    product1_desc:        '生成AI技術を搭載した子ども向け学習デバイス。インタラクティブな対話を通じて学びを深めます。',
    product2_category:    'IoT',
    product2_name:        '画像認識 IoTデバイス',
    product2_desc:        '高精度な画像認識機能を搭載したスマートIoTデバイス。環境を理解し、適切に反応します。',
    product3_category:    'エンターテインメント',
    product3_name:        'AIインタラクティブ トイ',
    product3_desc:        '生成AIと連携した次世代インタラクティブトイ。子どもの創造性と感性を育みます。',

    /* Demo page */
    demo_page_title:      '千里同風株式会社 — オンラインデモ',
    demo_eyebrow:         'オンラインデモ',
    demo_title:           '機能を体験する',
    demo_intro:           '開発中の機能をブラウザ上でご体験いただけます。各デモは随時アップデートされます。',
    demo1_title:          '画像認識デモ',
    demo1_desc:           'カメラで撮影した画像、または画像ファイルをAIがリアルタイムで分析・識別します。',
    demo2_title:          '会話AI デモ',
    demo2_desc:           '自然言語での対話ができるAIアシスタントを体験できます。',
    demo3_title:          '音声インターフェース デモ',
    demo3_desc:           '音声コマンドでデバイスを操作するインターフェースのデモです。',
    demo4_title:          '感情認識 デモ',
    demo4_desc:           '表情や音声から感情を認識するAIモデルのデモです。',
    demo_coming:          '近日公開',

    analysis_title: '文書分析 · 比較レポート',
    analysis_desc:  '複数のPDF・Word・Excelをアップロードし、AIが内容を横断分析してレポートを生成。事業モデルの比較・調査分析に。',
    analysis_cta:   '分析ツールを開く',

    lifestory_title: '生平故事 · 人生インタビュー',
    lifestory_desc:  '約100問のインタビューに答えると、AIがあなたの生涯を一冊の物語に。毎回数問ずつ、約一ヶ月で完成。',
    lifestory_cta:   '記録を始める',

    japanese_title: '日本語基礎学習ツール',
    japanese_desc:  '214語の常用動詞を内蔵。五段・一段・不規則動詞の活用を自動生成し、中英双解付き。一覧・フラッシュカード・小テストの3モード対応。',
    japanese_cta:   '学習を始める',

    /* Blog page */
    blog_page_title:      '千里同風株式会社 — ブログ',
    blog_eyebrow:         'ブログ',
    blog_title:           'インサイト',
    blog_intro:           'AI・ハードウェア・日本市場に関する考察と発見を書き留めています。',
    blog_empty:           '記事は近日公開予定です。',

    /* Translation tool */
    tl_page_title:    '千里同風 — 中日翻訳ツール',
    tl_eyebrow:       '翻訳ツール',
    tl_title:         '中日翻訳 + 回訳検証',
    tl_lead:          '中国語・日本語を相互翻訳し、回訳で精度を確認。会議の議事録作成にも対応。',
    tl_input_label:   '入力 / 输入',
    tl_history_label: '対話記録 / 对话记录',
    tl_history_empty: '翻訳を開始すると記録が表示されます。',
  },

  zh: {
    nav_about:        '关于我们',
    nav_team:         '团队',
    nav_milestones:   '大事记',
    nav_solutions:    '解决方案',
    nav_products:     '产品',
    nav_demo:         '在线演示',
    nav_blog:         '博客',

    hero_corp:        '千里同風株式会社',
    hero_tagline:     '人类对AI陪伴的一切渴望，不过是对灵魂共鸣的向往。',
    hero_scroll:      '向下滑动',

    mission_eyebrow:  '使命',
    mission_title:    '通过融合AI与硬件，缩短人与技术之间的距离。',
    mission_body:     '我们将生成式AI嵌入硬件产品，打造兼具温度与智识的产品。技术应服务于人——秉持这一理念，我们专注于面向日本市场的产品企划与研发。',

    vision_eyebrow:   '愿景',
    vision_title:     '创造一个充满温度的AI融入人们日常生活的世界。',
    vision_body:      '通过玩具、教具与IoT设备，探索人与AI之间新的关系。这就是我们所追求的未来。',

    values_eyebrow:   '价值观',
    values_title:     '技术服务于人',
    val1_name:        '现实主义',
    val1_desc:        '脚踏实地的规划与执行。在追求理想的同时，诚实地寻求可实现的路径。',
    val2_name:        '清晰',
    val2_desc:        '将复杂的技术转化为每个人都能理解的语言与形式。清晰的沟通是信任的基础。',
    val3_name:        '责任',
    val3_desc:        '拥有技术力量的人，对其使用方式负责。我们致力于AI的伦理化应用。',

    about_teaser_eyebrow: '关于我们',
    about_teaser_title:   '从大阪出发，探索连接人与AI的新形式。',
    about_teaser_body:    '千里同風株式会社是一家专注于生成式AI硬件产品研究与企划的公司。我们提供从市场调研到产品概念开发的全程支持。',
    about_teaser_cta:     '了解团队',

    nav_member:            '会员',

    footer_tagline:        '人类对AI陪伴的一切渴望，不过是对灵魂共鸣的向往。',
    footer_nav_heading:    '导航',
    footer_contact_heading:'联系方式',
    footer_copy:           '© 2024 千里同風株式会社',
    addr_street:           '大阪府大阪市淀川区西三国4丁目4-9-7',
    addr_city:             '大阪市, 日本',

    team_page_title:      '千里同風株式会社 — 团队',
    team_eyebrow:         '团队',
    team_title:           '我们的团队',
    team_body:            '精简的团队，共同开拓AI与硬件的未来。',
    team1_role:           '代表取締役',
    team1_bio:            '千里同風株式会社代表。主导面向日本市场的AI硬件产品的事业开发与市场拓展，专注于产品企划与供应链构建。',
    team2_role:           '商业顾问',
    team2_bio:            '中国注册会计师（CPA）。负责财务战略与跨境商业咨询，支持中日之间的业务开发与财务管理。',

    milestones_page_title: '千里同風株式会社 — 大事记',
    milestones_eyebrow:   '大事记',
    milestones_title:     '公司历程',
    milestones_body:      '了解千里同風株式会社从成立至今的发展历程。',
    ms1_event:            '千里同風株式会社 成立',
    ms1_desc:             '于大阪市成立。作为专注于生成式AI硬件研究与企划的公司正式启动。',
    ms2_event:            '开始市场调研与产品企划',
    ms2_desc:             '启动面向日本市场的生成式AI硬件产品调研与概念开发。探索教育、医疗、消费电子及公共服务领域的可能性。',
    ms3_event:            '官方网站上线',
    ms3_desc:             '千里同風株式会社官方网站全新上线，向全球传达公司愿景与服务内容。',

    solutions_page_title: '千里同風株式会社 — 解决方案',
    solutions_eyebrow:    '解决方案',
    solutions_title:      '产品与服务',
    solutions_body:       '融合生成式AI与硬件的全新产品类别。我们在教育、IoT与娱乐领域，探索人与AI的新型关系。',
    services_eyebrow:     '服务',
    services_title:       '我们能提供什么',
    srv1_name:            '市场与行业调研',
    srv1_desc:            '跨境分析、竞争评估、用户洞察。基于对日本市场的深度理解，提供专业调研服务。',
    srv2_name:            '产品企划与市场进入支持',
    srv2_desc:            '从供应链调研、用户研究、概念开发，到合作伙伴促成，提供全链条支持。',
    srv3_name:            'AI集成硬件开发',
    srv3_desc:            '支持集成生成式AI、图像识别、语音界面的硬件产品企划与原型开发。',
    coming_soon:          '即将发布',
    product1_category:    '教育',
    product1_name:        'AI学习设备',
    product1_desc:        '搭载生成式AI技术的儿童学习设备。通过互动对话深化学习体验。',
    product2_category:    'IoT',
    product2_name:        '图像识别 IoT设备',
    product2_desc:        '搭载高精度图像识别功能的智能IoT设备。理解环境并做出恰当响应。',
    product3_category:    '娱乐',
    product3_name:        'AI互动玩具',
    product3_desc:        '与生成式AI联动的新一代互动玩具。培育孩子的创造力与感性。',

    demo_page_title:      '千里同風株式会社 — 在线演示',
    demo_eyebrow:         '在线演示',
    demo_title:           '体验功能',
    demo_intro:           '您可以在浏览器中直接体验我们正在开发的功能。各演示将持续更新。',
    demo1_title:          '图像识别演示',
    demo1_desc:           'AI实时分析识别您的摄像头画面或上传的图片文件。',
    demo2_title:          '对话AI演示',
    demo2_desc:           '体验能够进行自然语言对话的AI助手。',
    demo3_title:          '语音界面演示',
    demo3_desc:           '演示通过语音命令控制设备的交互界面。',
    demo4_title:          '情感识别演示',
    demo4_desc:           '演示从面部表情与声音中识别情感的AI模型。',
    demo_coming:          '即将发布',

    analysis_title: '文件分析 · 对比报告',
    analysis_desc:  '上传多份 PDF、Word、Excel，AI 跨文件交叉分析，自动生成对比报告。适合商业模型比较与调研分析。',
    analysis_cta:   '打开分析工具',

    lifestory_title: '生平故事 · 人生访谈',
    lifestory_desc:  '约 100 个精心设计的问题，以文字或语音作答，AI 为你撰写完整的人生传记。每次几题，大约一个月完成。',
    lifestory_cta:   '开始记录',

    japanese_title: '日语基础学习工具',
    japanese_desc:  '内置 214 个常用动词词库，自动生成五段・一段・不规则动词变形，含中英双语释义。支持查表、翻牌练习、随机小测试三种模式。',
    japanese_cta:   '开始学习',

    blog_page_title:      '千里同風株式会社 — 博客',
    blog_eyebrow:         '博客',
    blog_title:           '洞察',
    blog_intro:           '记录我们对AI、硬件与日本市场的思考与发现。',
    blog_empty:           '文章即将发布，敬请期待。',

    tl_page_title:    '千里同風 — 中日翻译工具',
    tl_eyebrow:       '翻译工具',
    tl_title:         '中日互译 + 回译验证',
    tl_lead:          '中文与日文双向翻译，通过回译确认准确度，支持会议记录生成。',
    tl_input_label:   '输入 / 入力',
    tl_history_label: '对话记录 / 対話記録',
    tl_history_empty: '开始翻译后，记录将显示于此。',
  },

  en: {
    nav_about:        'About',
    nav_team:         'Team',
    nav_milestones:   'Milestones',
    nav_solutions:    'Solutions',
    nav_products:     'Products',
    nav_demo:         'Online Demo',
    nav_blog:         'Blog',

    hero_corp:        'Senridoufuu Co., Ltd.',
    hero_tagline:     'Every human desire for closeness with AI is nothing but a yearning for resonance of souls.',
    hero_scroll:      'scroll',

    mission_eyebrow:  'Mission',
    mission_title:    'Bridging the distance between people and technology through AI-hardware integration.',
    mission_body:     'We embed generative AI into hardware products to create items with warmth and intelligence. Technology exists for people — guided by this belief, we plan and develop products for the Japanese market.',

    vision_eyebrow:   'Vision',
    vision_title:     'Creating a world where warm, intelligent AI quietly becomes part of everyday life.',
    vision_body:      'Through toys, educational tools, and IoT devices, we explore new relationships between humans and AI. This is the future we seek.',

    values_eyebrow:   'Values',
    values_title:     'Technology Serves People',
    val1_name:        'Realism',
    val1_desc:        'Grounded planning and execution. While holding onto ideals, we honestly pursue achievable paths.',
    val2_name:        'Clarity',
    val2_desc:        'Translating complex technology into language and forms everyone can understand. Clear communication is the foundation of trust.',
    val3_name:        'Responsibility',
    val3_desc:        'Those with the power of technology must be responsible for how it is used. We are committed to the ethical application of AI.',

    about_teaser_eyebrow: 'About',
    about_teaser_title:   'From Osaka, exploring new ways to connect people and AI.',
    about_teaser_body:    'Senridoufuu Co., Ltd. specializes in research and planning for generative AI-embedded hardware products. We offer end-to-end support from market research to product concept development.',
    about_teaser_cta:     'Meet the team',

    nav_member:            'Member',

    footer_tagline:        'Every human desire for closeness with AI is nothing but a yearning for resonance of souls.',
    footer_nav_heading:    'Navigation',
    footer_contact_heading:'Contact',
    footer_copy:           '© 2024 Senridoufuu Co., Ltd.',
    addr_street:           '3-chome, Nishimikuni, Yodogawa-ku',
    addr_city:             'Osaka, Japan',

    team_page_title:      'Senridoufuu — Team',
    team_eyebrow:         'Team',
    team_title:           'Our Team',
    team_body:            'A small, focused team exploring the frontier of AI and hardware.',
    team1_role:           'Representative Director',
    team1_bio:            'Founder of Senridoufuu Co., Ltd. Leads business development and market expansion for AI-embedded hardware products in Japan, focusing on product planning and supply chain construction.',
    team2_role:           'Business Advisor',
    team2_bio:            'Certified Public Accountant (CPA), China. Provides advisory on financial strategy and cross-border business development, supporting operations between China and Japan.',

    milestones_page_title: 'Senridoufuu — Milestones',
    milestones_eyebrow:   'Milestones',
    milestones_title:     'Our Journey',
    milestones_body:      'A look at the key moments in Senridoufuu\'s history, from founding to the present.',
    ms1_event:            'Senridoufuu Co., Ltd. Founded',
    ms1_desc:             'Established in Osaka. The company launches as a research and planning firm specializing in generative AI-embedded hardware.',
    ms2_event:            'Market Research & Product Planning Begins',
    ms2_desc:             'Initiated research and concept development for generative AI hardware products targeting the Japanese market, exploring opportunities in education, healthcare, consumer electronics, and public services.',
    ms3_event:            'Official Website Launch',
    ms3_desc:             'Senridoufuu\'s official website relaunches, communicating the company\'s vision and services to a global audience.',

    solutions_page_title: 'Senridoufuu — Solutions',
    solutions_eyebrow:    'Solutions',
    solutions_title:      'Products & Services',
    solutions_body:       'A new category of products merging generative AI and hardware. We propose new ways for people and AI to relate through education, IoT, and entertainment.',
    services_eyebrow:     'Services',
    services_title:       'What We Offer',
    srv1_name:            'Market & Industry Research',
    srv1_desc:            'Cross-border analysis, competitor assessment, and user insights — grounded in a deep understanding of the Japanese market.',
    srv2_name:            'Product Planning & Market Entry',
    srv2_desc:            'End-to-end support from supply chain research and user studies through concept development and partnership facilitation.',
    srv3_name:            'AI-Integrated Hardware Development',
    srv3_desc:            'Planning and prototyping support for hardware products incorporating generative AI, image recognition, and voice interfaces.',
    coming_soon:          'Coming Soon',
    product1_category:    'Education',
    product1_name:        'AI Learning Device',
    product1_desc:        'A generative AI-powered learning device for children, deepening understanding through interactive dialogue.',
    product2_category:    'IoT',
    product2_name:        'Image Recognition IoT Device',
    product2_desc:        'A smart IoT device with high-precision image recognition that understands its environment and responds appropriately.',
    product3_category:    'Entertainment',
    product3_name:        'AI Interactive Toy',
    product3_desc:        'A next-generation interactive toy connected to generative AI, nurturing children\'s creativity and sensibility.',

    demo_page_title:      'Senridoufuu — Online Demo',
    demo_eyebrow:         'Online Demo',
    demo_title:           'Experience Our Features',
    demo_intro:           'Try our features in development directly in your browser. All demos are updated regularly.',
    demo1_title:          'Image Recognition Demo',
    demo1_desc:           'AI analyzes and identifies images from your camera or uploaded files in real time.',
    demo2_title:          'Conversational AI Demo',
    demo2_desc:           'Experience an AI assistant capable of natural language conversation.',
    demo3_title:          'Voice Interface Demo',
    demo3_desc:           'Demo of an interface that controls devices via voice commands.',
    demo4_title:          'Emotion Recognition Demo',
    demo4_desc:           'Demo of an AI model that recognizes emotions from facial expressions and voice.',
    demo_coming:          'Coming Soon',

    analysis_title: 'Document Analysis · Comparison Report',
    analysis_desc:  'Upload multiple PDFs, Word docs, or Excel files. AI cross-references content and generates a structured comparison report.',
    analysis_cta:   'Open Analysis Tool',

    lifestory_title: 'Life Story · Personal Interview',
    lifestory_desc:  'Answer around 100 thoughtfully designed questions by text or voice. AI compiles your answers into a complete life memoir — a few questions at a time, finished in about a month.',
    lifestory_cta:   'Start Recording',

    japanese_title: 'Japanese Verb Learning Tool',
    japanese_desc:  'Built-in library of 214 common verbs. Auto-generates conjugations for godan, ichidan, and irregular verbs with bilingual (Chinese/English) definitions. Three modes: reference table, flashcards, and quiz.',
    japanese_cta:   'Start Learning',

    blog_page_title:      'Senridoufuu — Blog',
    blog_eyebrow:         'Blog',
    blog_title:           'Insights',
    blog_intro:           'Notes on AI, hardware, and the Japanese market — our observations and discoveries.',
    blog_empty:           'Articles coming soon.',

    tl_page_title:    'Senridoufuu — Translation Tool',
    tl_eyebrow:       'Translation Tool',
    tl_title:         'Chinese ⇄ Japanese + Back-Translation',
    tl_lead:          'Bidirectional translation with back-translation verification. Meeting minutes generation included.',
    tl_input_label:   'Input / 入力 / 输入',
    tl_history_label: 'Session Log / 対話記録 / 对话记录',
    tl_history_empty: 'Your translation history will appear here.',
  }
};

/* === NAV HTML (shared across all pages) === */
const NAV_HTML = `
<nav class="nav" id="nav">
  <div class="nav__container">
    <a href="./" class="nav__logo">
      <span class="nav__logo-kanji">千里同風</span>
      <span class="nav__logo-sub">株式会社</span>
    </a>
    <div class="nav__right">
      <div class="nav__links">
        <div class="nav__item nav__item--has-dropdown">
          <a href="about/" class="nav__link" data-i18n="nav_about"></a>
          <div class="nav__dropdown">
            <a href="about/" class="nav__dropdown-link" data-i18n="nav_team"></a>
            <a href="about/milestones.html" class="nav__dropdown-link" data-i18n="nav_milestones"></a>
          </div>
        </div>
        <div class="nav__item nav__item--has-dropdown">
          <a href="solutions/" class="nav__link" data-i18n="nav_solutions"></a>
          <div class="nav__dropdown">
            <a href="solutions/" class="nav__dropdown-link" data-i18n="nav_products"></a>
            <a href="solutions/demo.html" class="nav__dropdown-link" data-i18n="nav_demo"></a>
            <a href="solutions/blog/" class="nav__dropdown-link" data-i18n="nav_blog"></a>
          </div>
        </div>
      </div>
      <a href="/account.html" class="nav__link" style="font-size:0.8125rem;opacity:.7;" data-i18n="nav_member">会员</a>
      <div class="nav__lang" id="langDesktop">
        <button class="nav__lang-btn" data-lang="ja">日</button>
        <span class="nav__lang-sep">/</span>
        <button class="nav__lang-btn" data-lang="zh">中</button>
        <span class="nav__lang-sep">/</span>
        <button class="nav__lang-btn" data-lang="en">En</button>
      </div>
      <button class="nav__hamburger" id="hamburger" aria-label="Toggle menu">
        <span></span><span></span><span></span>
      </button>
    </div>
  </div>
</nav>
<div class="nav__mobile" id="navMobile">
  <div class="nav__mobile-section">
    <div class="nav__mobile-parent" data-i18n="nav_about"></div>
    <a href="about/" class="nav__mobile-child" data-i18n="nav_team"></a>
    <a href="about/milestones.html" class="nav__mobile-child" data-i18n="nav_milestones"></a>
  </div>
  <div class="nav__mobile-section">
    <div class="nav__mobile-parent" data-i18n="nav_solutions"></div>
    <a href="solutions/" class="nav__mobile-child" data-i18n="nav_products"></a>
    <a href="solutions/demo.html" class="nav__mobile-child" data-i18n="nav_demo"></a>
    <a href="solutions/blog/" class="nav__mobile-child" data-i18n="nav_blog"></a>
  </div>
  <div class="nav__mobile-lang" id="langMobile">
    <button class="nav__mobile-lang-btn" data-lang="ja">日本語</button>
    <button class="nav__mobile-lang-btn" data-lang="zh">中文</button>
    <button class="nav__mobile-lang-btn" data-lang="en">English</button>
  </div>
</div>
`;

/* === FOOTER HTML (shared across all pages) === */
const FOOTER_HTML = `
<footer class="footer">
  <div class="footer__container">
    <div class="footer__top">
      <div>
        <div class="footer__brand-name">千里同風</div>
        <div class="footer__brand-sub">株式会社</div>
        <p class="footer__tagline" data-i18n="footer_tagline"></p>
      </div>
      <div>
        <div class="footer__col-heading" data-i18n="footer_nav_heading"></div>
        <div class="footer__links">
          <a href="about/" class="footer__link" data-i18n="nav_team"></a>
          <a href="about/milestones.html" class="footer__link" data-i18n="nav_milestones"></a>
          <a href="solutions/" class="footer__link" data-i18n="nav_products"></a>
          <a href="solutions/demo.html" class="footer__link" data-i18n="nav_demo"></a>
          <a href="solutions/blog/" class="footer__link" data-i18n="nav_blog"></a>
        </div>
      </div>
      <div>
        <div class="footer__col-heading" data-i18n="footer_contact_heading"></div>
        <address class="footer__address">
          <a href="mailto:yuki.minami@senridf.com">yuki.minami@senridf.com</a><br><br>
          <span data-i18n="addr_street"></span><br>
          <span data-i18n="addr_city"></span>
        </address>
      </div>
    </div>
    <div class="footer__bottom">
      <span class="footer__copy" data-i18n="footer_copy"></span>
    </div>
  </div>
</footer>
`;

/* === LANGUAGE STATE === */
let currentLang = localStorage.getItem('sdf_lang') || 'ja';

/* === APPLY TRANSLATIONS === */
function applyTranslations(lang) {
  const t = T[lang] || T.ja;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (t[key] !== undefined) el.textContent = t[key];
  });
  // Active state on language buttons
  document.querySelectorAll('[data-lang]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  // html lang attr
  const langMap = { ja: 'ja', zh: 'zh-CN', en: 'en' };
  document.documentElement.lang = langMap[lang] || 'ja';
  // Page title
  const titleKey = document.body.dataset.pageTitle;
  if (titleKey && t[titleKey]) document.title = t[titleKey];
}

/* === SWITCH LANGUAGE === */
function switchLang(lang) {
  currentLang = lang;
  localStorage.setItem('sdf_lang', lang);
  applyTranslations(lang);
}

/* === INJECT SHARED COMPONENTS === */
function injectShared() {
  const navEl = document.getElementById('nav-placeholder');
  const footerEl = document.getElementById('footer-placeholder');
  if (navEl) navEl.innerHTML = NAV_HTML;
  if (footerEl) footerEl.innerHTML = FOOTER_HTML;

  // Bind language buttons
  document.querySelectorAll('[data-lang]').forEach(btn => {
    btn.addEventListener('click', () => switchLang(btn.dataset.lang));
  });

  // Mobile hamburger toggle
  const hamburger = document.getElementById('hamburger');
  const navMobile = document.getElementById('navMobile');
  if (hamburger && navMobile) {
    hamburger.addEventListener('click', () => {
      const open = hamburger.classList.toggle('is-open');
      navMobile.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    // Close mobile nav on link click
    navMobile.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        hamburger.classList.remove('is-open');
        navMobile.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });
  }

  // Nav backdrop on scroll
  const navBar = document.getElementById('nav');
  if (navBar) {
    const onScroll = () => navBar.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Mark active nav link
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === path || (href !== '' && href !== '/' && path.startsWith(href))) {
      link.classList.add('is-active');
    }
  });
}

/* === SCROLL ANIMATIONS === */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -48px 0px' });

  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));
}

/* === INIT === */
document.addEventListener('DOMContentLoaded', () => {
  injectShared();
  fetch('/content.json')
    .then(r => r.ok ? r.json() : {})
    .then(ov => { ['ja','zh','en'].forEach(l => { if (ov[l]) Object.assign(T[l], ov[l]); }); })
    .catch(() => {})
    .finally(() => { applyTranslations(currentLang); initScrollAnimations(); });
});
