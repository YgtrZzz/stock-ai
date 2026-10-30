# Task List — Persistência de Imagens Multi-Perfil & Preparação Nativa YOLO

> Gerado via skill `planning-and-task-breakdown`. Plano arquitetural completo em [`tasks/plan.md`](./plan.md).

---

## Task 1: Migração Não-Destrutiva do SQLite (`image_uri`) e Testes de Contrato de Dados

**Description:** Remover o `DROP TABLE IF EXISTS items` destrutivo de `database.js`, implementando migração incremental segura baseada em `PRAGMA table_info(items)`, adicionar a função `updateItemImage(id, image_uri)` (com atualização otimista correspondente) e criar um script de testes automatizados (usando Node test runner `node --test` com Fake/Mock SQLite em memória) para provar a persistência de `image_uri` nos fluxos `'home'` e `'business'`.

**Acceptance criteria:**
- [x] `initDatabase()` preserva dados existentes na tabela `items` e garante a presença das colunas `quantity`, `barcode` e `image_uri` via migração idempotente.
- [x] Nova função `persistCapturedImage(sourceUri)` move fotos do cache da câmera para `FileSystem.documentDirectory` via `expo-file-system` antes de salvar no SQLite.
- [x] Nova função `updateItemImage(id, image_uri)` atualiza o `image_uri` de um item existente usando query parametrizada (`?`).
- [x] Testes automatizados validam `insertItem`, `getItems`, `getItemByBarcode` e `updateItemImage` com e sem `image_uri`.

**Verification:**
- [x] Tests pass: `node --test tests/database.test.mjs`
- [x] Syntax check succeeds: `node --check database.js`
- [x] Manual check: Reiniciar o app e confirmar que itens cadastrados anteriormente permanecem salvos no SQLite.

**Dependencies:** None

**Files likely touched:**
- `ArmarioDigital/database.js`
- `ArmarioDigital/tests/database.test.mjs`

**Estimated scope:** Small (2 files)

---

## Checkpoint: After Task 1 (Fundação de Dados)
- [x] Todos os testes de contrato de banco passam (`node --test tests/database.test.mjs`)
- [x] `database.js` sem erros de sintaxe e 100% parametrizado

---

## Task 2: Contrato de Inferência e Pré-processamento YOLO (`vision/yoloAdapter.js`)

**Description:** Criar a camada de domínio de visão computacional (`vision/yoloAdapter.js`) que define o contrato de entrada (imagem capturada `{ uri, width, height }`) e saída (`Array<{ id, label, confidence, bbox: [x, y, w, h] }>`), funções puras de filtragem por *confidence threshold*, agregação de contagem para lote B2B e adaptador *plug-and-play* pronto para receber o modelo `.tflite`.

**Acceptance criteria:**
- [x] Funções puras `normalizeDetections(rawDetections, minConfidence)` e `summarizeDetectionsForProfile(detections, userProfile)` implementadas e exportadas.
- [x] No perfil `'home'`, `summarizeDetectionsForProfile` retorna a classe principal de maior confiança para sugestão de nome; no perfil `'business'`, retorna a contagem total de instâncias detectadas para sugestão de lote.
- [x] Suíte de testes unitários cobre coordenadas fora de limite, listas vazias, filtro de confiança e resumo por perfil.

**Verification:**
- [x] Tests pass: `node --test tests/yoloAdapter.test.mjs`
- [x] Syntax check succeeds: `node --check vision/yoloAdapter.js`

**Dependencies:** Task 1

**Files likely touched:**
- `ArmarioDigital/vision/yoloAdapter.js`
- `ArmarioDigital/tests/yoloAdapter.test.mjs`

**Estimated scope:** Small (2 files)

---

## Task 3: Componente Nativo de Overlay Vetorial YOLO (`components/YoloCameraOverlay.js`)

**Description:** Construir o componente nativo de sobreposição óptica utilizando `react-native-svg` e os tokens estritos `true-black-flat` (`#c6f24e` para *bounding boxes* e *confidence pills* com `tabular-nums`, superfície `#111111` para barra de status do detector, ícones Lucide, zero emojis).

**Acceptance criteria:**
- [x] Renderiza retângulos vetoriais (`Svg`, `Rect`) escalados proporcionalmente às dimensões do container da `CameraView` / pré-visualização.
- [x] Exibe pílula de identificação com rótulo e percentual de confiança (`fontVariant: ['tabular-nums']`).
- [x] Passa no linter `design-taste-frontend` sem nenhuma falha ou aviso.

**Verification:**
- [x] Linter passes: `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app components/YoloCameraOverlay.js`
- [x] Syntax check succeeds: `node --check components/YoloCameraOverlay.js`

**Dependencies:** Task 2

**Files likely touched:**
- `ArmarioDigital/components/YoloCameraOverlay.js`

**Estimated scope:** XS (1 file)

---

## Checkpoint: After Tasks 2-3 (Infraestrutura YOLO Pronta)
- [x] Testes unitários de visão computacional passam (`node --test tests/yoloAdapter.test.mjs`)
- [x] Linter `design-taste-frontend` aprova `components/YoloCameraOverlay.js` (`0 FAIL, 0 WARN`)
- [x] Revisão intermediária com o humano se necessário

---

## Task 4: Integração Vertical Multi-Perfil no Scanner e Inventário (`App.js`)

**Description:** Conectar o `YoloCameraOverlay` e o fluxo completo de imagem local na `ScannerScreen` e na `InventarioScreen`, adicionando fallback resiliente (`onError`) nas imagens renderizadas (`'home'` *full-bleed cover* vs. `'business'` avatar circular `44x44`) e mantendo o *Optimistic UI* em todas as operações.

**Acceptance criteria:**
- [x] Na `ScannerScreen`: captura fotográfica captura `{ uri, width, height }`, exibe miniatura de confirmação e permite acionar a análise de detecção (preenchendo sugestão de nome no modo `'home'` ou quantidade detectada no modo `'business'`).
- [x] Na `InventarioScreen`: se `item.image_uri` falhar ao carregar (`onError`), o card degrada graciosamente sem espaço quebrado, exibindo placeholder vetorial discreto em `true-black-flat`.
- [x] `keyExtractor={(item) => String(item.id)}` e *Optimistic UI* permanecem inalterados e performáticos.

**Verification:**
- [x] Linter passes: `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app App.js`
- [x] All tests pass: `node --test tests/*.test.mjs`
- [x] Manual check: Testar captura, preview, salvamento e visualização no inventário alternando entre os perfis **Casa** e **Negócio**.

**Dependencies:** Task 1, Task 2, Task 3

**Files likely touched:**
- `ArmarioDigital/App.js`

**Estimated scope:** Small (1 file)

---

## Task 5: Revisão em 5 Eixos (`code-review-and-quality`) e Documentação Técnica (`PROJETO.md`)

**Description:** Executar o checklist completo da skill `code-review-and-quality` (Corretude, Legibilidade, Arquitetura, Segurança e Performance), verificar higiene de código morto e atualizar `PROJETO.md` documentando a arquitetura de persistência de imagens e o contrato de acoplamento `.tflite`.

**Acceptance criteria:**
- [x] Checklist de 5 eixos concluído sem itens `Critical` ou `Required` pendentes.
- [x] `PROJETO.md` atualizado com o fluxo de visão computacional e migração segura SQLite.

**Verification:**
- [x] Full test suite passes: `node --test tests/*.test.mjs`
- [x] Full UI lint passes: `node .agents/skills/design-taste-frontend/scripts/lint.mjs --app App.js components/YoloCameraOverlay.js`

**Dependencies:** Task 4

**Files likely touched:**
- `ArmarioDigital/PROJETO.md`
- `ArmarioDigital/tasks/todo.md`

**Estimated scope:** Small (2 files)
