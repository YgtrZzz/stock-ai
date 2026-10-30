# 📦 Armário Digital — Multi-Profile Inventory Tracker (Home & B2B)

> Sistema mobile de organização física e gestão de estoque com **arquitetura Multi-Perfil (Residencial e B2B)** orientada por Onboarding inicial, focado em **alta performance 100% offline** e **organização hierárquica de espaços**.

---

## 🎯 1. Visão Geral

O **Armário Digital** opera sob uma arquitetura adaptativa **Multi-Perfil** que atende tanto **usuários domésticos (Uso Pessoal / Casa)** quanto **pequenos e médios empreendedores (B2B / Controle de Estoque)** a partir da mesma base sólida *Offline-First*.

Na primeira abertura do aplicativo, um **Onboarding Inicial** pergunta ao usuário *"Como você vai usar o Armário Digital?"*, persistindo a escolha localmente via `@react-native-async-storage/async-storage` e adaptando dinamicamente toda a experiência de captura, terminologia e controles operacionais:

* **🏠 Perfil Residencial (`'home'` — Uso Pessoal):** Focado na catalogação rápida de pertences domésticos, roupas, ferramentas e caixas organizadoras por cômodos e sub-compartimentos, destacando o botão principal de **Tirar Foto do Item** e ocultando complexidades de códigos comerciais.
* **🏢 Perfil Comercial (`'business'` — Para meu Negócio):** Focado em alta velocidade de giro de estoque B2B, ativando o **Scanner Nativo de Códigos de Barras e QR Codes** com **Soma Automática (`+1`)** para SKUs já cadastrados e **atalhos rápidos de lote** (`+1`, `+5`, `+10`, `+25`).

---

## 🛠️ 2. Stack Tecnológico

| Camada | Tecnologia | Papel na Arquitetura |
| :--- | :--- | :--- |
| **Core Mobile** | **React Native (`0.88`)** | Renderização nativa multiplataforma (Android / iOS) com alto desempenho |
| **Ecossistema & Build** | **Expo (`SDK 58`)** | Runtime moderno, gerenciamento de módulos nativos e *Developer Experience* |
| **Persistência Relacional** | **SQLite (`expo-sqlite`)** | Banco de dados relacional embarcado com suporte a `WAL` e *Foreign Keys* |
| **Estado de Perfil & Onboarding** | **AsyncStorage (`@react-native-async-storage/async-storage`)** | Persistência local da preferência de perfil (`'home'` ou `'business'`) |
| **Navegação** | **React Navigation (`@react-navigation/bottom-tabs`)** | Arquitetura em Bottom Tabs com controle de ciclo de vida por foco (`useFocusEffect`) |
| **Captura & Sensores** | **Expo Camera (`expo-camera`)** | Captura fotográfica de itens (`'home'`) e leitor de códigos de barras/QR Code (`'business'`) |
| **Design System & Ícones** | **`true-black-flat` + `lucide-react-native`** | Tokens semânticos em preto absoluto (`#000000` / `#111111`) e ícones vetoriais SVG |

---

## ✨ 3. Arquitetura e Funcionalidades Concluídas (Features)

### 🚀 Onboarding Inicial e Arquitetura Multi-Perfil (`ProfileContext`)
* Verificação assíncrona no `useEffect` de abertura lendo a chave `@armario_digital:user_profile` no `AsyncStorage`.
* Caso nenhum perfil esteja definido, exibe a tela **`OnboardingScreen`** no estilo `true-black-flat` com dois grandes cards de decisão:
  1. **Uso Pessoal (Organizar minha casa)** → Grava `'home'`.
  2. **Para meu Negócio (Controle de estoque)** → Grava `'business'`.
* Botão rápido no cabeçalho superior permitindo alternar entre os perfis **Casa** e **Negócio** a qualquer momento.

### 📷 Adaptação Dinâmica da Aba Scanner (`'home'` vs. `'business'`)
* **No Perfil `'home'` (Residencial):**
  * Oculta o painel de leitura de código de barras.
  * Destaca um grande botão primário invertido **"Tirar Foto do Item"**, acionando `takePictureAsync()` na `CameraView` com feedback tátil e direcionando o foco para nomear o objeto e escolher o cômodo.
* **No Perfil `'business'` (B2B):**
  * Ativa o leitor óptico contínuo de códigos comerciais (`qr`, `ean13`, `ean8`, `upc_a`, `upc_e`, `code128`) com trava anti-spam (`lastScannedData`).
  * **Soma Automática de SKUs Conhecidos:** Ao bipar um código já existente no banco (`getItemByBarcode`), dispensa o formulário manual, incrementa `+1` no estoque (`updateItemQuantity`), emite vibração dupla (`[0, 200, 200, 200]`) e atualiza o inventário imediatamente.
  * **Controle Rápido de Lote:** Exibe pílulas de incremento rápido (`+1`, `+5`, `+10`, `+25`, `1 un.`) para entrada ágil de caixas fechadas.

### 🗃️ Banco de Dados Relacional (`armario.db` — Schema v4)
Modelagem SQLite estruturada com integridade referencial ativa (`PRAGMA foreign_keys = ON`) e versionamento via `PRAGMA user_version`:
* **Tabela `spaces`:** Armazena os cômodos ou setores físicos com auto-relacionamento (`id`, `name`, `parent_id`, `created_at`).
* **Tabela `items`:** Armazena os itens com controle de volume e código comercial (`id`, `name`, `space_id`, `quantity`, `barcode`, `created_at`), conectada à tabela `spaces` via **Foreign Key (`space_id`)**.

### 🏢 Hierarquia de Armazenagem (Drill-down Infinito)
* Navegação em árvore de profundidade arbitrária utilizando a chave recursiva `parent_id` na tabela `spaces` (ex: `Quarto Casal > Closet > Gaveta 2` no modo Casa, ou `Estoque Central > Prateleira A > Caixa 04` no modo Negócio).

### ⚡ Giro de Estoque Rápido com *Optimistic UI*
* Painel de ações rápidas diretamente no card de cada item na `FlatList` (**Diminuir**, **Aumentar** e **Excluir**).
* Implementado com o padrão **Optimistic UI Updates**: o estado local (`setItems`) é atualizado instantaneamente no toque e a persistência no SQLite ocorre em *background*, eliminando qualquer *flickering* na lista.

### 🔍 Busca em Tempo Real (`LEFT JOIN`)
* Barra de pesquisa fixa no topo da aba **Inventário** integrada a consultas SQL parametrizadas (`WHERE items.name LIKE ?`) com `LEFT JOIN` na tabela `spaces`, exibindo localização, código de barras (quando aplicável) e pílula semântica de quantidade.

---

## 🧠 4. Decisões de Engenharia (Histórico Técnico)

### 1. Remoção do TensorFlow.js / MobileNet Legado
Abandonamos e removemos completamente a integração inicial com TensorFlow.js/MobileNet devido à baixa precisão comercial do dataset genérico ImageNet para produtos específicos e ao peso das dependências legadas, preparando o terreno para um pipeline enxuto com modelo YOLO customizado.

### 2. Design System `true-black-flat` (`design-taste-frontend`)
Refatoramos toda a interface aplicando estritamente os tokens `true-black-flat`: elevação exclusivamente por degrau de luminosidade (`#000000` → `#111111` → `#2a2a2a`), ausência de bordas ou sombras artificiais em cards, controles primários por inversão (pílulas brancas `#ffffff` com texto `#000000`), algarismos tabulares (`tabular-nums`) e substituição total de emojis por ícones vetoriais SVG (`lucide-react-native`).

---

## 🚀 5. Roadmap e Próximos Passos

* **✅ [Concluído] Design System `true-black-flat` & Arquitetura Multi-Perfil:**
  * Implementação do Onboarding Inicial (`'home'` vs. `'business'`) com adaptação dinâmica do Scanner e validação de UI via `design-taste-frontend`.
* **🎯 [Próximo Grande Marco] Visão Computacional Avançada (Custom YOLO):**
  * Treinamento de um modelo **YOLO** customizado utilizando **Transfer Learning** com datasets residenciais e B2B.
* **📱 Inferência 100% Offline no Dispositivo (Edge AI):**
  * Integração do modelo treinado no app via formato **`.tflite` (TensorFlow Lite)** para detecção e contagem automática de itens 100% offline (*Edge AI*).
