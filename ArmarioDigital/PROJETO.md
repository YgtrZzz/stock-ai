# 📦 Armário Digital - B2B Inventory Tracker

> Sistema mobile de gestão de estoque focado em **alta performance 100% offline**, rastreabilidade rápida e **organização hierárquica de espaços** para pequenos e médios empreendedores.

---

## 🎯 1. Visão Geral

O **Armário Digital - B2B Inventory Tracker** nasceu para resolver uma dor real de operações comerciais, almoxarifados e estoques de pequeno e médio porte: a necessidade de localizar mercadorias, controlar quantidades e mapear endereçamentos físicos (galpões, corredores, estantes, prateleiras e caixas) sem depender de conectividade constante com a internet ou de sistemas ERP lentos e burocráticos.

Projetado sob uma arquitetura *Offline-First*, o aplicativo garante **latência zero** no giro de estoque diário, aliando persistência relacional em SQLite no dispositivo, leitura nativa de códigos comerciais pela câmera e atualizações instantâneas de interface (*Optimistic UI*).

---

## 🛠️ 2. Stack Tecnológico

| Camada | Tecnologia | Papel na Arquitetura |
| :--- | :--- | :--- |
| **Core Mobile** | **React Native** | Renderização nativa multiplataforma (Android / iOS) com alto desempenho |
| **Ecossistema & Build** | **Expo (SDK 58)** | Runtime moderno, gerenciamento de módulos nativos e *Developer Experience* |
| **Persistência Local** | **SQLite (`expo-sqlite`)** | Banco de dados relacional embarcado com suporte a `WAL` e *Foreign Keys* |
| **Navegação** | **React Navigation (`@react-navigation/bottom-tabs`)** | Arquitetura em Bottom Tabs com controle de ciclo de vida por foco (`useFocusEffect`) |
| **Captura & Sensores** | **Expo Camera (`expo-camera`)** | Leitor nativo de códigos de barras/QR Code e futura entrada para Visão Computacional |

---

## ✨ 3. Arquitetura e Funcionalidades Concluídas (Features)

### 🧭 Navegação em 3 Abas Principais
Interface estruturada em três fluxos operacionais independentes e complementares com tema escuro (*Dark Mode* B2B de alto contraste):
* **📷 Scanner:** Captura rápida de produtos via câmera, definição de lote/quantidade e vínculo imediato ao local de armazenagem.
* **🏠 Espaços:** Gestão da árvore física do estoque (cômodos, corredores, armários, prateleiras e sub-divisões).
* **🗄️ Inventário:** Painel gerencial com totalizadores de SKUs e unidades, busca instantânea e controle rápido de giro de estoque.

### 🗃️ Banco de Dados Relacional (`armario.db`)
Modelagem SQLite estruturada com integridade referencial ativa (`PRAGMA foreign_keys = ON`) e versionamento via `PRAGMA user_version`:
* **Tabela `spaces`:** Armazena os locais físicos com suporte a auto-relacionamento (`id`, `name`, `parent_id`, `created_at`).
* **Tabela `items`:** Armazena os produtos do estoque com controle de volume (`id`, `name`, `space_id`, `quantity`, `created_at`), conectada à tabela `spaces` via **Foreign Key (`space_id`)** com política `ON DELETE SET NULL`.

### 🏢 Hierarquia de Armazenagem (Drill-down Infinito)
* Navegação em árvore de profundidade arbitrária utilizando a chave recursiva `parent_id` na tabela `spaces`.
* Permite modelar estruturas físicas reais de qualquer complexidade (ex: `Estoque Central > Prateleira A > Caixa 2`), com barra de *breadcrumb* contextual e botão de retorno (`⬅️ Voltar`) para subir níveis na hierarquia.

### ⚡ Giro de Estoque Rápido com *Optimistic UI*
* Painel de ações rápidas diretamente no card de cada item na `FlatList`:
  * **➕ Aumentar:** Incrementa o saldo do item.
  * **➖ Diminuir:** Decrementa o saldo com trava de segurança para impedir estoques negativos (mínimo `0`).
  * **🗑️ Excluir:** Remove o registro mediante confirmação nativa (`Alert`).
* Implementado com o padrão **Optimistic UI Updates**: o estado local (`setItems`) é atualizado instantaneamente no momento do toque e a persistência no SQLite (`updateItemQuantity` / `deleteItem`) ocorre de forma assíncrona em *background*, eliminando qualquer *flickering* ou "pulo" visual na lista e preservando o *scroll*.

### 🔍 Busca B2B em Tempo Real
* Barra de pesquisa fixa no topo da aba **Inventário** integrada a consultas SQL parametrizadas (`WHERE items.name LIKE ?`).
* Utiliza `LEFT JOIN` entre `items` e `spaces` (`spaces.name AS space_name`), permitindo localizar qualquer SKU enquanto o usuário digita e exibindo imediatamente o **Local de Armazenagem** e a **Quantidade** disponível.

### 📊 Scanner Nativo de Códigos Comerciais
* Integração direta com o motor nativo da `CameraView` configurado para os principais padrões do varejo e logística (`qr`, `ean13`, `ean8`, `upc_a`, `upc_e`, `code128`).
* **Preenchimento Automático & Feedback Tátil:** Ao detectar um código válido, o formulário é preenchido automaticamente e o dispositivo emite uma confirmação tátil (`Vibration.vibrate(100)`).
* **Trava Anti-Spam:** Controle de estado (`lastScannedData`) que bloqueia leituras repetidas enquanto a câmera permanece apontada para o mesmo produto, sendo resetado automaticamente após salvar o item.

---

## 🧠 4. Decisões de Engenharia (Histórico Técnico)

### Remoção do TensorFlow.js / MobileNet Legado
Nas primeiras iterações do projeto, avaliamos o uso de classificação genérica de imagens com `@tensorflow/tfjs`, `@tensorflow/tfjs-react-native` e `@tensorflow-models/mobilenet`.

**Decisão Arquitetural:** Abandonamos e removemos completamente a integração com TensorFlow.js/MobileNet, bem como todas as suas dependências transitivas legadas (`expo-gl`, `react-native-fs`, `@react-native-async-storage/async-storage`).

**Motivação:**
1. **Baixa precisão comercial em produtos de nicho:** O MobileNet (treinado no dataset genérico ImageNet) não possui granularidade suficiente para distinguir SKUs comerciais específicos, insumos industriais, embalagens B2B ou componentes técnicos.
2. **Peso e conflitos de dependências:** As bibliotecas legadas do `tfjs-react-native` geravam conflitos de *peer dependencies* com o ecossistema moderno do React Native / Expo e aumentavam desnecessariamente o tamanho do binário.
3. **Foco em solução customizada:** A limpeza da base de código abriu caminho para uma arquitetura enxuta, estável e preparada para receber um modelo de detecção de objetos treinado especificamente para o domínio do negócio.

---

## 🚀 5. Roadmap e Próximos Passos

* **🛠️ [Fase Atual] Automação de Engenharia com MCP:**
  * Criação da Skill **`'Arquiteto React Native'`** via **MCP (Model Context Protocol)** para padronizar e automatizar implementações de interface, componentes B2B e fluxos de tela no aplicativo.
* **🎯 [Próximo Grande Marco] Visão Computacional Avançada (Custom YOLO):**
  * Construção de pipeline de treinamento de um modelo **YOLO** customizado utilizando **Transfer Learning** sobre datasets B2B específicos da operação.
* **📱 Inferência 100% Offline no Dispositivo (Edge AI):**
  * Exportação e quantização do modelo YOLO treinado para o formato **`.tflite` (TensorFlow Lite)**.
  * Integração direta no aplicativo mobile para detecção e contagem de múltiplos itens em tempo real com alta precisão e **100% offline (*Edge AI*)**.

---

## 📂 Estrutura Principal do Projeto

```text
ArmarioDigital/
├── App.js          # Navegação (Bottom Tabs), Telas (Scanner, Espaços, Inventário) e Optimistic UI
├── database.js     # Camada de persistência SQLite (Schema v3, CRUD relacional, LEFT JOIN e Busca B2B)
├── index.js        # Ponto de entrada da aplicação Expo
├── app.json        # Configurações do projeto Expo
├── package.json    # Dependências e scripts de execução
└── PROJETO.md      # Documentação oficial de arquitetura, histórico técnico e roadmap
```

## ▶️ Como Executar em Desenvolvimento

```bash
# 1. Acesse a pasta do aplicativo mobile
cd ArmarioDigital

# 2. Instale as dependências
npm install

# 3. Inicie o servidor Expo limpando o cache de bundler
npx expo start -c
```
