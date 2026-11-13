<div align="center">

# 📦 Armário Digital — B2B Inventory Tracker

**Sistema Mobile de Gestão de Estoque de Alta Performance Offline & Organização Hierárquica para Pequenos e Médios Empreendedores**

[![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactnative.dev/)
[![Expo SDK 58](https://img.shields.io/badge/Expo_SDK_58-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![SQLite](https://img.shields.io/badge/SQLite_Local-07405E?style=for-the-badge&logo=sqlite&logoColor=white)](https://docs.expo.dev/versions/latest/sdk/sqlite/)
[![React Navigation](https://img.shields.io/badge/React_Navigation-6B52AE?style=for-the-badge&logo=react&logoColor=white)](https://reactnavigation.org/)
[![Architecture](https://img.shields.io/badge/Architecture-Offline--First-00ffcc?style=for-the-badge&labelColor=121212)](#)

</div>

---

## 💡 Sobre o Projeto

O **Armário Digital - B2B Inventory Tracker** é uma solução mobile *Offline-First* projetada para resolver os gargalos reais de controle de almoxarifado, pequenos centros de distribuição e operações comerciais B2B.

Ao contrário de sistemas tradicionais que exigem conexão constante e fluxos lentos de carregamento, o **Armário Digital** combina **persistência relacional SQLite embarcada**, **leitura nativa de códigos comerciais pela câmera** e o padrão **Optimistic UI** para entregar **latência zero** no giro de estoque e no mapeamento físico de mercadorias.

---

## ✨ Features Atuais

### 🧭 1. Navegação Fluida em Bottom Tabs
Interface ergonômica em *Dark Mode* de alto contraste dividida em três pilares operacionais:
* **📷 Scanner:** Captura ágil de códigos de barras/QR Codes, entrada rápida de lotes (`quantity`) e endereçamento imediato ao espaço físico.
* **🏠 Espaços:** Criação e navegação hierárquica em múltiplos níveis (*Drill-down*) pelos locais de armazenamento.
* **🗄️ Inventário:** Painel gerencial com contadores em tempo real de SKUs e volume total de unidades, barra de busca instantânea e controle rápido de saldo.

### 🗃️ 2. Banco de Dados SQLite Relacional & Drill-Down Hierárquico
Modelagem local robusta em `armario.db` com `WAL` (*Write-Ahead Logging*) e integridade referencial (`PRAGMA foreign_keys = ON`):
* **Relacionamento `items` ↔ `spaces`:** A tabela `items` (com controle de `quantity`) conecta-se à tabela `spaces` via *Foreign Key* (`space_id`).
* **Hierarquia Infinita (`parent_id`):** Suporte nativo a sub-espaços recursivos (*ex: `Estoque Central › Corredor A › Prateleira 2 › Caixa 04`*), com navegação por toque e barra de retorno contextual (`⬅️ Voltar`).

### ⚡ 3. Giro de Estoque com *Optimistic UI*
Painel de ações rápidas integrado diretamente aos cards do inventário (**`➕ Aumentar`**, **`➖ Diminuir`** com trava contra saldo negativo e **`🗑️ Excluir`** com confirmação nativa):
* **Zero *Flickering*:** As alterações de saldo e exclusões atualizam instantaneamente a árvore de estado do React (`setItems`) preservando a posição exata de rolagem da `FlatList`, enquanto os comandos `UPDATE` e `DELETE` são sincronizados no SQLite em *background* (com *rollback* automático em caso de falha).

### 🔍 4. Busca B2B em Tempo Real (`LEFT JOIN`)
* Barra de pesquisa fixa no cabeçalho do inventário que executa queries parametrizadas (`WHERE items.name LIKE ?`) combinadas com `LEFT JOIN spaces ON items.space_id = spaces.id`, exibindo o nome do produto, a quantidade em estoque e a tag de localização exata (`📍 Local`).

### 📊 5. Scanner Nativo de Códigos de Barras e QR Code
* Integração direta com o motor nativo da `CameraView` homologado para os principais padrões comerciais e logísticos: `EAN-13`, `EAN-8`, `UPC-A`, `UPC-E`, `Code 128` e `QR Code`.
* **Feedback Tátil & Trava Anti-Spam:** Ao ler um código, o app preenche automaticamente a identificação do produto, emite vibração confirmação (`Vibration.vibrate(100)`) e aciona a trava de estado `lastScannedData`, impedindo leituras duplicadas enquanto a câmera permanece apontada para o mesmo item.

---

## 🧠 Decisões de Engenharia

> **Por que removemos o TensorFlow.js / MobileNet legado?**
>
> Durante a fase inicial de validação, testamos classificação genérica de imagens com `@tensorflow/tfjs-react-native` e `MobileNet`. Na prática comercial B2B, modelos genéricos treinados no dataset *ImageNet* apresentam baixa precisão para distinguir SKUs específicos, caixas técnicas, ferramentas e embalagens industriais, além de introduzirem dependências nativas pesadas e obsoletas.
>
> **Decisão:** Removemos 100% da stack legada de IA genérica para manter o binário leve, moderno e focado na construção de um **pipeline próprio de Visão Computacional com YOLO customizado + TensorFlow Lite (`.tflite`)**.

---

## 🛠️ Stack Tecnológico

| Tecnologia | Versão / Módulo | Finalidade |
| :--- | :--- | :--- |
| **React Native** | `0.85` | Desenvolvimento mobile nativo multiplataforma |
| **Expo** | `SDK 58` | Ecossistema de build e acesso a APIs nativas |
| **SQLite** | `expo-sqlite` | Persistência relacional local assíncrona (`WAL` + `Foreign Keys`) |
| **React Navigation** | `@react-navigation/bottom-tabs` | Gerenciamento de rotas e foco de telas (`useFocusEffect`) |
| **Expo Camera** | `expo-camera` | Scanner nativo de códigos de barras/QR Code e captura óptica |

---

## 🚀 Roadmap

- [x] **Fundação Relacional Offline:** Modelagem SQLite v3 com tabelas `spaces` e `items` (`quantity` + `space_id`).
- [x] **Navegação & Drill-Down Hierárquico:** Arquitetura em 3 abas com sub-espaços recursivos via `parent_id`.
- [x] **Giro de Estoque B2B & Busca Instantânea:** Ações rápidas com *Optimistic UI* e pesquisa `LEFT JOIN` em tempo real.
- [x] **Scanner Comercial Nativo:** Leitura de códigos de barras (`EAN/UPC/Code128/QR`) com feedback tátil e controle anti-spam.
- [ ] **🤖 [Em Andamento] Automação via MCP:** Criação da Skill **`'Arquiteto React Native'`** via *Model Context Protocol* para acelerar a geração padronizada de componentes e fluxos de interface.
- [ ] **🎯 [Próximo Marco] Visão Computacional Customizada (YOLO):** Treinamento de modelo **YOLO** próprio utilizando *Transfer Learning* com datasets de produtos e insumos B2B.
- [ ] **📱 [Futuro] Inferência 100% Offline (Edge AI):** Exportação do modelo treinado para o formato **`.tflite`** e integração nativa no app para contagem e reconhecimento visual de múltiplos itens sem internet.

---

## 📂 Estrutura do Repositório

```text
ArmarioDigital/
├── App.js          # Navegação (Bottom Tabs), Telas (Scanner, Espaços, Inventário) e Optimistic UI
├── database.js     # Camada SQLite (Schema v3, CRUD Relacional, LEFT JOIN, Update/Delete)
├── index.js        # Entrypoint da aplicação Expo
├── app.json        # Manifesto e permissões nativas do Expo
├── package.json    # Gerenciamento de dependências
└── PROJETO.md      # Documentação técnica detalhada e histórico de arquitetura
```

---

## ▶️ Como Executar Localmente

### Pré-requisitos
* **Node.js** (LTS recomendado)
* Aplicativo **Expo Go** instalado no dispositivo físico (Android / iOS) ou emulador configurado.

### Passo a passo

```bash
# 1. Clone o repositório
git clone <url-do-repositorio>

# 2. Acesse o diretório do aplicativo mobile
cd ArmarioDigital

# 3. Instale as dependências
npm install

# 4. Inicie o bundler do Expo limpando o cache
npx expo start -c
```

Escaneie o QR Code exibido no terminal com o **Expo Go** para testar a câmera, o leitor de códigos de barras e o banco SQLite diretamente no seu smartphone.

---

<div align="center">
  <sub>Desenvolvido com foco em Engenharia de Software Mobile, Performance Offline e Edge AI.</sub>
</div>
