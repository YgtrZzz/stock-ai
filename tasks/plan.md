# Implementation Plan: Persistência Definitiva de Imagens Multi-Perfil & Preparação Nativa YOLO (Edge AI)

## Overview
Consolidar e blindar o ciclo completo de captura, persistência SQLite (`image_uri`) e renderização resiliente de imagens locais respeitando estritamente as regras de negócio dos perfis **Residencial (`'home'`)** e **Comercial (`'business'`)**, ao mesmo tempo em que decompomos o módulo óptico e preparamos os componentes nativos, contratos de inferência e overlay vetorial (`react-native-svg`) para acoplamento direto do futuro modelo **YOLO customizado (`.tflite` / Edge AI)**.

---

## Architecture Decisions

1. **Migração Não-Destrutiva no SQLite (`database.js`):**
   - **Decisão:** Substituir o `DROP TABLE IF EXISTS items` temporário por inspeção real de colunas via `PRAGMA table_info(items)` e migração incremental (`ALTER TABLE items ADD COLUMN ...`), além de adicionar função dedicada `updateItemImage(id, image_uri)` para permitir anexar/atualizar foto em SKUs já existentes no perfil `'business'` ou itens domésticos no perfil `'home'`.
   - **Racional:** Evita perda de dados entre atualizações de schema e permite que SKUs criados apenas com código de barras no modo B2B recebam fotografia posteriormente.

2. **Resiliência de Renderização de Imagens Multi-Perfil (`'home'` vs. `'business'`):**
   - **Decisão:** Adicionar tratamento de erro de carregamento (`onError`) e estados de *fallback* honestos (`true-black-flat`, sem emojis) tanto no banner *full-bleed* (`userProfile === 'home'`) quanto no avatar circular `44x44` (`userProfile === 'business'`), além de normalizar as dimensões/qualidade na captura (`takePictureAsync({ quality: 0.65, skipProcessing: false })`) para já entregar tensores/frames enxutos ao pipeline YOLO.
   - **Racional:** URIs locais podem ser invalidados pelo cache do SO; a UI não pode exibir espaços quebrados em branco nem perder performance na `FlatList`.

3. **Decomposição Modular Antes da Expansão (`code-review-and-quality`):**
   - **Decisão:** `App.js` ultrapassou `2.200` linhas. Seguindo a diretriz *"Decompose, then add"* da skill `code-review-and-quality`, extrair o contrato de visão computacional (`vision/yoloAdapter.js`) e o componente nativo de overlay/visor (`components/YoloCameraOverlay.js`) em módulos dedicados antes de acoplar a lógica de detecção na aba Scanner.
   - **Racional:** Reduz acoplamento, mantém cada arquivo dentro do limite saudável e isola a futura dependência nativa `.tflite`.

4. **Camada Nativa de Overlay YOLO com `react-native-svg` (Zero Dependências Extras Agora):**
   - **Decisão:** Utilizar `react-native-svg` (já instalado e compatível com Expo SDK 58) para construir o componente `YoloCameraOverlay`, desenhando *bounding boxes* normalizadas (`[x, y, width, height]` em escala `0..1`) e pílulas de confiança (`tabular-nums`, cor de marca de dados `#c6f24e`) sobre a `CameraView`.
   - **Racional:** Prepara 100% da interface nativa de visão computacional sem instalar bibliotecas pesadas antes da hora (respeitando a *Dependency Discipline*). Quando o arquivo `.tflite` estiver treinado, bastará conectar o motor de inferência via *Development Build* (`expo-dev-client` + `react-native-fast-tflite`).

---

## Dependency Graph (Bottom-Up Implementation Order)

```
[Camada 1: Persistência & Testes de Contrato SQLite (database.js)]
    │  - Migração segura sem DROP TABLE (PRAGMA table_info)
    │  - Persistência/atualização de image_uri + preservação em Soma Automática B2B
    │
    ├──► [Camada 2: Contrato de Inferência & Pre-processing YOLO (vision/yoloAdapter.js)]
    │       │  - Schema de Detecção: { id, label, confidence, bbox: [x,y,w,h] }
    │       │  - Pipeline de entrada a partir do frame/URI capturado na CameraView
    │       │
    │       └──► [Camada 3: Componente Nativo de Visor & Bounding Boxes (components/YoloCameraOverlay.js)]
    │               │  - Renderização SVG de Bounding Boxes (#c6f24e) + Confidence Pills (tabular-nums)
    │               │  - Adaptação por Perfil ('home': sugestão de nome do objeto | 'business': contagem de lote/SKU)
    │               │
    └──► [Camada 4: Integração Vertical Multi-Perfil no Scanner e Inventário (App.js)]
            - Captura + Preview + Fallback de Imagem ('home' Cover vs 'business' Avatar)
            - Integração do YoloCameraOverlay e gatilho de preenchimento assistido
```

---

## Task List

### Phase 1: Blindagem do SQLite e Testes de Persistência de Imagem (TDD)
- [x] **Task 1:** Migração não-destrutiva do SQLite (`image_uri`), realocação permanente para `FileSystem.documentDirectory` (`expo-file-system`), função `updateItemImage` e suíte de testes de contrato de dados.

### Checkpoint 1: Fundação de Dados
- [x] Testes automatizados do contrato SQLite passam (`RED → GREEN → REFACTOR`).
- [x] `node --check database.js` executa sem erros.

### Phase 2: Infraestrutura Nativa para o Modelo YOLO (Contrato + Overlay Vetorial)
- [x] **Task 2:** Criar módulo `vision/yoloAdapter.js` com contratos de detecção, normalização de coordenadas e *stub* determinístico para testes de integração.
- [x] **Task 3:** Criar componente nativo `components/YoloCameraOverlay.js` (`react-native-svg`) seguindo estritamente os tokens `true-black-flat`.

### Checkpoint 2: Componentes Nativos YOLO Prontos
- [x] Testes unitários de normalização de *bounding boxes* e filtro de *confidence threshold* passam.
- [x] Linter `design-taste-frontend` aprova `components/YoloCameraOverlay.js` com `0 FAIL, 0 WARN`.

### Phase 3: Integração Multi-Perfil (`'home'` vs. `'business'`) e Portão de Qualidade Final
- [x] **Task 4:** Integrar persistência resiliente de imagem (`onError` fallback + atualização de foto) e o `YoloCameraOverlay` na `ScannerScreen` e `InventarioScreen` respeitando os perfis `'home'` e `'business'`.
- [x] **Task 5:** Revisão em 5 Eixos (`code-review-and-quality`), atualização do `PROJETO.md` com especificação de *Development Build* para `.tflite` e verificação final.

### Checkpoint 3: Marco Concluído (Definition of Done)
- [x] Suíte de testes passa integralmente.
- [x] Linter `design-taste-frontend` passa em todos os arquivos de UI (`0 FAIL, 0 WARN`).
- [x] Fluxo ponta a ponta validado nos perfis `'home'` e `'business'`.

---

## Quality Gates (Portões de Qualidade)

1. **Portão TDD (`test-driven-development`):**
   - Nenhuma lógica de banco ou de transformação de coordenadas YOLO entra sem um teste que falhe primeiro (**RED**) e passe com a implementação mínima (**GREEN**).
2. **Portão de Design System (`design-taste-frontend`):**
   - Execução obrigatória de `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app App.js` (e novos componentes de UI), exigindo **`0 FAIL, 0 WARN`**, zero emojis, superfícies `#000000` / `#111111` / `#2a2a2a`, marcas de dados em `#c6f24e` e `tabular-nums`.
3. **Portão de Code Review em 5 Eixos (`code-review-and-quality`):**
   - **Correctness:** Tratamento de URIs inválidas/expiradas, quantidades e concorrência na câmera.
   - **Readability:** Código DAMP nos testes e nomes de domínio claros.
   - **Architecture:** Extração de `vision/yoloAdapter.js` e `components/YoloCameraOverlay.js` para não inflar `App.js`.
   - **Security:** Queries SQLite 100% parametrizadas (`?`) e sanitização de strings/URIs.
   - **Performance:** `keyExtractor={(item) => String(item.id)}`, *Optimistic UI* intacto e overlay SVG leve sem re-renders desnecessários.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Limpeza de cache do SO apagar fotos antigas do `takePictureAsync`** | Medium | Implementar estado `imageLoadError` com fallback visual limpo no card (`'home'` e `'business'`) e permitir recaptura/atualização via `updateItemImage`. |
| **`DROP TABLE IF EXISTS items` apagar estoque real em futuras execuções** | High | Substituir imediatamente na Task 1 por migração idempotente com `PRAGMA table_info(items)` e `ALTER TABLE`. |
| **Módulos nativos `.tflite` (JSI/C++) não rodam no cliente padrão Expo Go** | High | Isolar o motor de inferência atrás do adaptador `vision/yoloAdapter.js` com modo de simulação seguro no Expo Go e documentar a transição para `npx expo run:android|ios` (*Development Build*) quando o arquivo `.tflite` for conectado. |
| **Crescimento excessivo de `App.js` (>2.200 linhas)** | Medium | Extrair os novos módulos de visão computacional em `vision/` e `components/` em vez de adicioná-los inline no `App.js`. |

---

## Open Questions (Para Aprovação do Usuário)

1. **Persistência de Arquivos de Imagem:** Deseja manter apenas o URI nativo gerado pelo `expo-camera` (com fallback resiliente de UI, zero dependências novas) ou prefere que instalemos `expo-file-system` via `npx expo install` para copiar cada foto do cache temporário para o `documentDirectory` permanente do app?
2. **Comportamento do Assistente YOLO por Perfil:**
   - No perfil **Casa (`'home'`)**, ao detectar um objeto na foto capturada, o assistente deve sugerir automaticamente o preenchimento do campo **Nome do item** com a classe detectada?
   - No perfil **Negócio (`'business'`)**, ao detectar múltiplos objetos na mesma captura, o assistente deve sugerir automaticamente a soma da **Quantidade** correspondente ao número de *bounding boxes* detectadas?
