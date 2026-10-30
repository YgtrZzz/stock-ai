import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  NavigationContainer,
  DarkTheme,
  useFocusEffect,
  useIsFocused,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Barcode,
  CameraOff,
  ChevronRight,
  Folder,
  FolderOpen,
  Layers,
  MapPin,
  Minus,
  Package,
  PackageOpen,
  Plus,
  ScanBarcode,
  Search,
  SearchX,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react-native';
import {
  initDatabase,
  addSpace,
  getSpaces,
  insertItem,
  getItemByBarcode,
  getItems,
  updateItemQuantity,
  deleteItem,
} from './database';

const Tab = createBottomTabNavigator();

/**
 * Design Tokens estritos do estilo 'true-black-flat' (design-taste-frontend):
 * - Elevação exclusivamente por degrau de luminosidade (#000000 -> #111111 -> #2a2a2a), sem bordas ou sombras em cards.
 * - Cor de destaque (--accent: #c6f24e) restrita às marcas de dados (quantidades, códigos lidos e métricas).
 * - Controles primários destacados por inversão: pílula branca (#ffffff) com texto preto (#000000).
 * - Navegação ativa marcada apenas pela transição de luminosidade (#b4b4b4 -> #ffffff).
 */
const TOKENS = {
  ground: '#000000',
  surface: '#111111',
  raised: '#2a2a2a',
  border: '#1a1a1a',
  rule: '#161616',
  control: '#444444',
  text: '#ffffff',
  muted: '#b4b4b4',
  faint: '#949494',
  accent: '#c6f24e',
  positive: '#c6f24e',
  negative: '#e5484d',
  warning: '#e5a93b',
  pillPositiveBg: '#222a10',
  pillPositiveInk: '#c6f24e',
  pillNegativeBg: '#2c1a20',
  pillNegativeInk: '#e5566f',
  pillWarningBg: '#2b2414',
  pillWarningInk: '#e5a93b',
  pillNeutralBg: '#222222',
  pillNeutralInk: '#ffffff',
  radiusCard: 20,
  radiusControl: 999,
  gap: 14,
  pad: 22,
  controlHeight: 36,
  fsTitle: 20,
  fsSection: 16,
  fsKpi: 24,
  fsBody: 14,
  fsSmall: 12,
};

const TEMA = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: TOKENS.text,
    background: TOKENS.ground,
    card: TOKENS.ground,
    text: TOKENS.text,
    border: TOKENS.rule,
  },
};

function formatarNomeEspaco(espaco) {
  if (!espaco) return '';
  return espaco.parent_name
    ? `${espaco.parent_name} / ${espaco.name}`
    : espaco.name;
}

/* ==========================================================
   ABA 1: SCANNER (Câmera + Soma Automática por Barcode + Formulário)
   ========================================================== */
function ScannerScreen({ onInventoryUpdated }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const [lastScannedData, setLastScannedData] = useState('');
  const lastScannedRef = useRef('');
  const processandoScanRef = useRef(false);
  const [espacos, setEspacos] = useState([]);
  const [espacoSelecionadoId, setEspacoSelecionadoId] = useState(null);
  const [aGuardar, setAGuardar] = useState(false);

  const isFocused = useIsFocused();

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      async function carregarEspacos() {
        try {
          const lista = await getSpaces();
          if (!ativo) return;
          setEspacos(lista);
          setEspacoSelecionadoId((atual) => {
            if (atual && lista.some((e) => e.id === atual)) return atual;
            return lista.length > 0 ? lista[0].id : null;
          });
        } catch (error) {
          console.error('Erro ao carregar espaços no Scanner:', error);
        }
      }
      carregarEspacos();
      return () => {
        ativo = false;
      };
    }, [])
  );

  const handleBarcodeScanned = async ({ data }) => {
    const valorLido = String(data ?? '').trim();
    if (!valorLido) return;

    if (
      valorLido === lastScannedData ||
      valorLido === lastScannedRef.current ||
      processandoScanRef.current
    ) {
      return;
    }

    processandoScanRef.current = true;
    lastScannedRef.current = valorLido;
    setLastScannedData(valorLido);

    try {
      const itemExistente = await getItemByBarcode(valorLido);

      if (itemExistente) {
        const novaQtd = Number(itemExistente.quantity ?? 1) + 1;
        await updateItemQuantity(itemExistente.id, novaQtd);

        setCurrentBarcode(null);
        setNome('');
        setQuantidade('1');
        Keyboard.dismiss();

        Vibration.vibrate([0, 200, 200, 200]);
        onInventoryUpdated?.();

        Alert.alert(
          '+1 adicionado ao estoque',
          `"${itemExistente.name}" atualizado para ${novaQtd} un.`,
          [
            {
              text: 'OK',
              onPress: () => {
                lastScannedRef.current = '';
                setLastScannedData('');
                processandoScanRef.current = false;
              },
            },
          ]
        );
      } else {
        setCurrentBarcode(valorLido);
        Vibration.vibrate(100);
        processandoScanRef.current = false;
      }
    } catch (error) {
      console.error('Erro ao buscar item por código de barras:', error);
      processandoScanRef.current = false;
    }
  };

  const nomeValido = nome.trim().length > 0;

  const handleSalvar = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || aGuardar) return;

    const qtdParsed = parseInt(quantidade.replace(/[^0-9]/g, ''), 10);
    const qtdFinal = Number.isFinite(qtdParsed) && qtdParsed > 0 ? qtdParsed : 1;

    setAGuardar(true);
    try {
      await insertItem(
        nomeLimpo,
        espacoSelecionadoId,
        qtdFinal,
        currentBarcode
      );
      const espacoEscolhido = espacos.find((e) => e.id === espacoSelecionadoId);
      const destinoTexto = espacoEscolhido
        ? ` em "${formatarNomeEspaco(espacoEscolhido)}"`
        : '';

      setNome('');
      setQuantidade('1');
      setCurrentBarcode(null);
      lastScannedRef.current = '';
      setLastScannedData('');
      processandoScanRef.current = false;
      Keyboard.dismiss();
      onInventoryUpdated?.();

      Alert.alert(
        'Item salvo',
        `${qtdFinal}x "${nomeLimpo}" guardado${destinoTexto} com sucesso.`
      );
    } catch (error) {
      console.error('Erro ao salvar item:', error);
      Alert.alert('Erro', 'Não foi possível salvar o item. Tente novamente.');
    } finally {
      setAGuardar(false);
    }
  };

  const renderCamera = () => {
    if (!permission) {
      return (
        <View style={styles.cameraPlaceholder}>
          <ActivityIndicator size="large" color={TOKENS.text} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.cameraPlaceholder}>
          <CameraOff size={28} color={TOKENS.muted} strokeWidth={1.5} />
          <Text style={styles.placeholderTitle}>Acesso à câmera</Text>
          <Text style={styles.placeholderText}>
            Conceda permissão para ler códigos EAN, UPC, Code 128 e QR Code.
          </Text>
          <TouchableOpacity
            style={styles.primaryInvertedPill}
            activeOpacity={0.85}
            onPress={requestPermission}
          >
            <Text style={styles.primaryInvertedPillText}>Permitir acesso</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return isFocused ? (
      <CameraView
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />
    ) : (
      <View style={styles.cameraPlaceholder} />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Visor óptico no topo */}
      <View style={styles.cameraContainer}>{renderCamera()}</View>

      {/* Painel de entrada em superfície #111111 sem bordas/sombras */}
      <View style={styles.scannerSheet}>
        {currentBarcode && (
          <View style={styles.scannedBarcodePill}>
            <View style={styles.scannedBarcodeLeft}>
              <Barcode
                size={16}
                color={TOKENS.pillPositiveInk}
                strokeWidth={1.5}
              />
              <Text style={styles.scannedBarcodeText} numberOfLines={1}>
                Código escaneado: {currentBarcode}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setCurrentBarcode(null);
                lastScannedRef.current = '';
                setLastScannedData('');
                processandoScanRef.current = false;
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={TOKENS.pillPositiveInk} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputRow}>
          <View style={styles.nameColumn}>
            <Text style={styles.label}>Nome do produto</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex: Caixa de Parafusos M6"
              placeholderTextColor={TOKENS.faint}
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={handleSalvar}
              editable={!aGuardar}
            />
          </View>

          <View style={styles.qtyColumn}>
            <Text style={styles.label}>Quantidade</Text>
            <TextInput
              style={[styles.input, styles.qtyInput]}
              value={quantidade}
              onChangeText={(txt) => setQuantidade(txt.replace(/[^0-9]/g, ''))}
              placeholder="1"
              placeholderTextColor={TOKENS.faint}
              keyboardType="numeric"
              maxLength={5}
              returnKeyType="done"
              onSubmitEditing={handleSalvar}
              editable={!aGuardar}
            />
          </View>
        </View>

        <Text style={styles.label}>Local de armazenagem</Text>
        {espacos.length === 0 ? (
          <View style={styles.noSpacesBox}>
            <Text style={styles.noSpacesText}>
              Nenhum espaço cadastrado. Crie locais na aba Espaços ou salve sem
              local.
            </Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorRow}
          >
            {espacos.map((espaco) => {
              const selecionado = espacoSelecionadoId === espaco.id;
              return (
                <TouchableOpacity
                  key={espaco.id}
                  style={[
                    styles.spaceChip,
                    selecionado && styles.spaceChipActive,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => setEspacoSelecionadoId(espaco.id)}
                >
                  <MapPin
                    size={13}
                    color={selecionado ? TOKENS.ground : TOKENS.muted}
                    strokeWidth={1.5}
                  />
                  <Text
                    style={[
                      styles.spaceChipText,
                      selecionado && styles.spaceChipTextActive,
                    ]}
                  >
                    {formatarNomeEspaco(espaco)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[
                styles.spaceChip,
                espacoSelecionadoId === null && styles.spaceChipActive,
              ]}
              activeOpacity={0.8}
              onPress={() => setEspacoSelecionadoId(null)}
            >
              <Text
                style={[
                  styles.spaceChipText,
                  espacoSelecionadoId === null && styles.spaceChipTextActive,
                ]}
              >
                Sem local
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <TouchableOpacity
          style={[
            styles.primaryInvertedButton,
            (!nomeValido || aGuardar) && styles.controlDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleSalvar}
          disabled={!nomeValido || aGuardar}
        >
          {aGuardar ? (
            <ActivityIndicator color={TOKENS.ground} />
          ) : (
            <View style={styles.buttonContentRow}>
              <Plus size={16} color={TOKENS.ground} strokeWidth={1.75} />
              <Text style={styles.primaryInvertedButtonText}>Salvar Item</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 2: ESPAÇOS (Drill-down Hierárquico em True-Black Flat)
   ========================================================== */
function EspacosScreen() {
  const [espacos, setEspacos] = useState([]);
  const [currentParentId, setCurrentParentId] = useState(null);
  const [nomeEspaco, setNomeEspaco] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [aCriar, setACriar] = useState(false);

  const carregarEspacos = useCallback(async () => {
    setACarregar(true);
    try {
      const lista = await getSpaces();
      setEspacos(lista);
    } catch (error) {
      console.error('Erro ao listar espaços:', error);
    } finally {
      setACarregar(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarEspacos();
    }, [carregarEspacos])
  );

  const espacoAtual = espacos.find((e) => e.id === currentParentId) || null;
  const espacosFiltrados = espacos.filter(
    (e) => (e.parent_id ?? null) === currentParentId
  );

  const nomeValido = nomeEspaco.trim().length > 0;

  const handleVoltar = () => {
    if (espacoAtual) {
      setCurrentParentId(espacoAtual.parent_id ?? null);
    } else {
      setCurrentParentId(null);
    }
  };

  const handleAdicionarEspaco = async () => {
    const nomeLimpo = nomeEspaco.trim();
    if (!nomeLimpo || aCriar) return;

    setACriar(true);
    try {
      await addSpace(nomeLimpo, currentParentId);
      setNomeEspaco('');
      Keyboard.dismiss();
      await carregarEspacos();
    } catch (error) {
      console.error('Erro ao criar espaço:', error);
      Alert.alert('Erro', 'Não foi possível cadastrar o espaço.');
    } finally {
      setACriar(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {currentParentId !== null && (
        <View style={styles.drilldownBar}>
          <TouchableOpacity
            style={styles.secondaryPillButton}
            activeOpacity={0.8}
            onPress={handleVoltar}
          >
            <ArrowLeft size={15} color={TOKENS.text} strokeWidth={1.5} />
            <Text style={styles.secondaryPillButtonText}>Voltar</Text>
          </TouchableOpacity>
          <View style={styles.breadcrumbBox}>
            <Text style={styles.breadcrumbLabel}>Nível atual</Text>
            <Text style={styles.breadcrumbTitle} numberOfLines={1}>
              {espacoAtual ? formatarNomeEspaco(espacoAtual) : 'Sub-espaço'}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.spaceFormCard}>
        <Text style={styles.label}>
          {currentParentId === null
            ? 'Novo espaço principal (ex: Estoque Central)'
            : `Novo sub-espaço em "${espacoAtual?.name || ''}" (ex: Prateleira A)`}
        </Text>
        <TextInput
          style={styles.input}
          value={nomeEspaco}
          onChangeText={setNomeEspaco}
          placeholder={
            currentParentId === null
              ? 'Ex: Estoque Central, Galpão 01'
              : 'Ex: Armário 1, Gaveta B'
          }
          placeholderTextColor={TOKENS.faint}
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={handleAdicionarEspaco}
          editable={!aCriar}
        />

        <TouchableOpacity
          style={[
            styles.primaryInvertedButton,
            (!nomeValido || aCriar) && styles.controlDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleAdicionarEspaco}
          disabled={!nomeValido || aCriar}
        >
          {aCriar ? (
            <ActivityIndicator color={TOKENS.ground} />
          ) : (
            <View style={styles.buttonContentRow}>
              <Plus size={16} color={TOKENS.ground} strokeWidth={1.75} />
              <Text style={styles.primaryInvertedButtonText}>
                {currentParentId === null
                  ? 'Cadastrar Espaço'
                  : 'Cadastrar Sub-espaço'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.sectionToolbar}>
        <Text style={styles.sectionHeading}>
          {currentParentId === null
            ? 'Espaços principais'
            : `Divisões de ${espacoAtual?.name || ''}`}
        </Text>
        <Text style={styles.sectionCountText}>
          {espacosFiltrados.length}{' '}
          {espacosFiltrados.length === 1 ? 'local' : 'locais'}
        </Text>
      </View>

      <FlatList
        data={espacosFiltrados}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={carregarEspacos}
        contentContainerStyle={
          espacosFiltrados.length === 0
            ? styles.emptyContainer
            : styles.listContent
        }
        renderItem={({ item }) => {
          const qtdSubespacos = espacos.filter(
            (sub) => sub.parent_id === item.id
          ).length;
          const qtdItens = item.item_count ?? 0;

          return (
            <TouchableOpacity
              style={styles.spaceCard}
              activeOpacity={0.78}
              onPress={() => setCurrentParentId(item.id)}
            >
              <View style={styles.spaceRowLeft}>
                {item.parent_id ? (
                  <Folder size={18} color={TOKENS.muted} strokeWidth={1.5} />
                ) : (
                  <Warehouse size={18} color={TOKENS.muted} strokeWidth={1.5} />
                )}
                <View style={styles.spaceTextColumn}>
                  <Text style={styles.cardTitleText} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardMetaText}>
                    {qtdSubespacos > 0
                      ? `${qtdSubespacos} ${qtdSubespacos === 1 ? 'sub-divisão' : 'sub-divisões'} · Toque para entrar`
                      : 'Toque para abrir ou adicionar sub-divisões'}
                  </Text>
                </View>
              </View>

              <View style={styles.spaceRightBox}>
                <View style={styles.neutralDataPill}>
                  <Text style={styles.neutralDataPillText}>
                    {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  color={TOKENS.faint}
                  strokeWidth={1.5}
                />
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              <FolderOpen size={28} color={TOKENS.faint} strokeWidth={1.5} />
              <Text style={styles.emptyText}>
                {currentParentId === null
                  ? 'Nenhum espaço principal cadastrado'
                  : 'Nenhuma sub-divisão neste espaço'}
              </Text>
              <Text style={styles.emptySubtext}>
                {currentParentId === null
                  ? 'Cadastre acima seu primeiro setor, galpão ou almoxarifado.'
                  : 'Adicione prateleiras, armários ou caixas dentro deste local.'}
              </Text>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 3: INVENTÁRIO (True-Black Flat + Busca B2B + Optimistic UI)
   ========================================================== */
function InventarioScreen({ refreshKey }) {
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [aCarregar, setACarregar] = useState(false);

  const carregarItens = useCallback(async (termoBusca = '') => {
    setACarregar(true);
    try {
      const data = await getItems(termoBusca);
      setItems(data);
    } catch (error) {
      console.error('Erro ao listar inventário:', error);
    } finally {
      setACarregar(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarItens(searchQuery);
    }, [carregarItens, searchQuery, refreshKey])
  );

  useEffect(() => {
    if (refreshKey > 0) {
      carregarItens(searchQuery);
    }
  }, [refreshKey, carregarItens, searchQuery]);

  // (➕) Optimistic UI Update: atualiza o estado local instantaneamente e persiste no SQLite em background
  const handleIncrementar = async (item) => {
    const qtdAtual = Number(item.quantity ?? 1);
    const novaQtd = qtdAtual + 1;

    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id ? { ...current, quantity: novaQtd } : current
      )
    );

    try {
      await updateItemQuantity(item.id, novaQtd);
    } catch (error) {
      console.error('Erro ao aumentar quantidade:', error);
      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id ? { ...current, quantity: qtdAtual } : current
        )
      );
      Alert.alert('Erro', 'Não foi possível aumentar a quantidade do item.');
    }
  };

  // (➖) Optimistic UI Update: decrementa no estado local (mínimo 0) e persiste no SQLite em background
  const handleDecrementar = async (item) => {
    const qtdAtual = Number(item.quantity ?? 1);
    if (qtdAtual <= 0) return;

    const novaQtd = Math.max(0, qtdAtual - 1);

    setItems((prev) =>
      prev.map((current) =>
        current.id === item.id ? { ...current, quantity: novaQtd } : current
      )
    );

    try {
      await updateItemQuantity(item.id, novaQtd);
    } catch (error) {
      console.error('Erro ao diminuir quantidade:', error);
      setItems((prev) =>
        prev.map((current) =>
          current.id === item.id ? { ...current, quantity: qtdAtual } : current
        )
      );
      Alert.alert('Erro', 'Não foi possível diminuir a quantidade do item.');
    }
  };

  // (🗑️) Optimistic UI Update: remove do estado local após confirmação e executa deleteItem em background
  const handleExcluir = (item) => {
    const { id } = item;

    Alert.alert('Confirmar exclusão', 'Tem certeza que deseja excluir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((current) => current.id !== id));

          try {
            await deleteItem(id);
          } catch (error) {
            console.error('Erro ao excluir item:', error);
            Alert.alert('Erro', 'Não foi possível excluir o item.');
            carregarItens(searchQuery);
          }
        },
      },
    ]);
  };

  const formatarData = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalUnidades = items.reduce((acc, item) => {
    const qtd = Number(item.quantity ?? 1);
    return acc + (Number.isFinite(qtd) ? qtd : 1);
  }, 0);

  return (
    <View style={styles.screen}>
      {/* KPI Strip (Padrão 'true-black-flat': container único dividido por hairline 1px #161616) */}
      <View style={styles.kpiStripWrapper}>
        <View style={styles.kpiStrip}>
          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>SKUs registrados</Text>
            <View style={styles.kpiValueRow}>
              <Text style={styles.kpiValue}>{items.length}</Text>
              <Text style={styles.kpiUnit}>
                {items.length === 1 ? 'item' : 'itens'}
              </Text>
            </View>
          </View>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>Volume em estoque</Text>
            <View style={styles.kpiValueRow}>
              <Text style={[styles.kpiValue, styles.kpiValueAccent]}>
                {totalUnidades}
              </Text>
              <Text style={styles.kpiUnit}>
                {totalUnidades === 1 ? 'un.' : 'uns.'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Barra de Pesquisa fixa abaixo dos KPIs */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputWrapper}>
          <Search size={16} color={TOKENS.faint} strokeWidth={1.5} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Pesquisar item pelo nome..."
            placeholderTextColor={TOKENS.faint}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              style={styles.clearSearchButton}
              onPress={() => setSearchQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={TOKENS.muted} strokeWidth={1.5} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={() => carregarItens(searchQuery)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          items.length === 0 ? styles.emptyContainer : styles.listContent
        }
        renderItem={({ item }) => {
          const qtd = Number(item.quantity ?? 1);
          const nomeLocal = item.space_name || 'Sem local definido';
          const semEstoque = qtd === 0;

          return (
            <View style={styles.inventoryCard}>
              {/* Linha Superior: Identificação + Metadados + Pílula Semântica de Quantidade */}
              <View style={styles.inventoryCardTopRow}>
                <View style={styles.itemInfo}>
                  <Text style={styles.cardTitleText} numberOfLines={1}>
                    {item.name}
                  </Text>

                  <View style={styles.metaPillsRow}>
                    <View style={styles.locationPill}>
                      <MapPin
                        size={12}
                        color={TOKENS.muted}
                        strokeWidth={1.5}
                      />
                      <Text style={styles.locationPillText} numberOfLines={1}>
                        {nomeLocal}
                      </Text>
                    </View>

                    {item.barcode ? (
                      <View style={styles.barcodeMetaPill}>
                        <Barcode
                          size={12}
                          color={TOKENS.faint}
                          strokeWidth={1.5}
                        />
                        <Text
                          style={styles.barcodeMetaPillText}
                          numberOfLines={1}
                        >
                          {item.barcode}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Text style={styles.cardMetaText}>
                    #{item.id} · {formatarData(item.created_at)}
                  </Text>
                </View>

                {/* Marca de Dados: Pílula de Quantidade (--pill-positive ou --pill-warning quando zero) */}
                <View
                  style={[
                    styles.quantityPill,
                    semEstoque
                      ? styles.quantityPillWarning
                      : styles.quantityPillPositive,
                  ]}
                >
                  <Text
                    style={[
                      styles.quantityPillValue,
                      semEstoque
                        ? styles.quantityPillValueWarning
                        : styles.quantityPillValuePositive,
                    ]}
                  >
                    {qtd}
                  </Text>
                  <Text
                    style={[
                      styles.quantityPillUnit,
                      semEstoque
                        ? styles.quantityPillValueWarning
                        : styles.quantityPillValuePositive,
                    ]}
                  >
                    un.
                  </Text>
                </View>
              </View>

              {/* Painel de Ações Rápidas (Giro de Estoque com ícones vetoriais Lucide) */}
              <View style={styles.actionPanel}>
                <View style={styles.qtyActionsGroup}>
                  <TouchableOpacity
                    style={[
                      styles.actionPillButton,
                      qtd <= 0 && styles.controlDisabled,
                    ]}
                    activeOpacity={0.75}
                    onPress={() => handleDecrementar(item)}
                    disabled={qtd <= 0}
                  >
                    <Minus size={15} color={TOKENS.text} strokeWidth={1.5} />
                    <Text style={styles.actionPillText}>Diminuir</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.actionPillButtonPrimary}
                    activeOpacity={0.8}
                    onPress={() => handleIncrementar(item)}
                  >
                    <Plus size={15} color={TOKENS.ground} strokeWidth={1.75} />
                    <Text style={styles.actionPillTextPrimary}>Aumentar</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.actionPillButtonDelete}
                  activeOpacity={0.75}
                  onPress={() => handleExcluir(item)}
                >
                  <Trash2
                    size={15}
                    color={TOKENS.pillNegativeInk}
                    strokeWidth={1.5}
                  />
                  <Text style={styles.actionPillTextDelete}>Excluir</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              {searchQuery.trim() ? (
                <SearchX size={28} color={TOKENS.faint} strokeWidth={1.5} />
              ) : (
                <PackageOpen size={28} color={TOKENS.faint} strokeWidth={1.5} />
              )}
              <Text style={styles.emptyText}>
                {searchQuery.trim()
                  ? `Nenhum resultado para "${searchQuery.trim()}"`
                  : 'Inventário vazio'}
              </Text>
              <Text style={styles.emptySubtext}>
                {searchQuery.trim()
                  ? 'Tente outro termo de pesquisa ou limpe o filtro.'
                  : 'Utilize a aba Scanner para bipar códigos ou cadastrar produtos.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

/* ==========================================================
   NAVEGAÇÃO PRINCIPAL (Scanner | Espaços | Inventário)
   ========================================================== */
export default function App() {
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  const handleInventoryUpdated = useCallback(() => {
    setInventoryRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    initDatabase().catch((err) =>
      console.error('Erro ao inicializar banco na abertura:', err)
    );
  }, []);

  return (
    <NavigationContainer theme={TEMA}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: TOKENS.ground,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: TOKENS.rule,
          },
          headerTintColor: TOKENS.text,
          headerTitleStyle: {
            fontSize: TOKENS.fsTitle,
            fontWeight: '600',
            color: TOKENS.text,
          },
          // Regra 'true-black-flat': item ativo marcado apenas por luminosidade (#b4b4b4 -> #ffffff)
          tabBarActiveTintColor: TOKENS.text,
          tabBarInactiveTintColor: TOKENS.muted,
          tabBarLabelStyle: {
            fontSize: TOKENS.fsSmall,
            fontWeight: '500',
          },
          tabBarStyle: {
            backgroundColor: TOKENS.ground,
            borderTopWidth: 1,
            borderTopColor: TOKENS.rule,
            elevation: 0,
          },
        }}
      >
        <Tab.Screen
          name="Scanner"
          options={{
            tabBarIcon: ({ color }) => (
              <ScanBarcode size={18} color={color} strokeWidth={1.5} />
            ),
          }}
        >
          {() => <ScannerScreen onInventoryUpdated={handleInventoryUpdated} />}
        </Tab.Screen>

        <Tab.Screen
          name="Espaços"
          component={EspacosScreen}
          options={{
            tabBarIcon: ({ color }) => (
              <Layers size={18} color={color} strokeWidth={1.5} />
            ),
          }}
        />

        <Tab.Screen
          name="Inventário"
          options={{
            tabBarIcon: ({ color }) => (
              <Package size={18} color={color} strokeWidth={1.5} />
            ),
          }}
        >
          {() => <InventarioScreen refreshKey={inventoryRefreshKey} />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.ground,
  },

  // Scanner e Câmera
  cameraContainer: {
    flex: 1,
    backgroundColor: TOKENS.ground,
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: TOKENS.pad,
    backgroundColor: TOKENS.surface,
    gap: 10,
  },
  placeholderTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    marginTop: 4,
  },
  placeholderText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    textAlign: 'center',
    marginBottom: 8,
    maxWidth: 280,
    lineHeight: 20,
  },
  scannerSheet: {
    padding: TOKENS.pad,
    backgroundColor: TOKENS.surface,
  },
  scannedBarcodePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.pillPositiveBg,
    borderRadius: TOKENS.radiusControl,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: TOKENS.gap,
  },
  scannedBarcodeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  scannedBarcodeText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: TOKENS.gap,
  },
  nameColumn: {
    flex: 1,
  },
  qtyColumn: {
    width: 104,
  },
  qtyInput: {
    textAlign: 'center',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    backgroundColor: TOKENS.raised,
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: TOKENS.gap,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: TOKENS.gap,
  },
  spaceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  spaceChipActive: {
    backgroundColor: TOKENS.text,
  },
  spaceChipText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  spaceChipTextActive: {
    color: TOKENS.ground,
    fontWeight: '600',
  },
  noSpacesBox: {
    backgroundColor: TOKENS.raised,
    borderRadius: 12,
    padding: 12,
    marginBottom: TOKENS.gap,
  },
  noSpacesText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    lineHeight: 18,
  },

  // Botões Primários por Inversão ('true-black-flat': pílula branca #ffffff com texto #000000)
  primaryInvertedButton: {
    backgroundColor: TOKENS.text,
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInvertedButtonText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  primaryInvertedPill: {
    backgroundColor: TOKENS.text,
    height: TOKENS.controlHeight,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInvertedPillText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  buttonContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  controlDisabled: {
    opacity: 0.35,
  },

  // Drill-down de Espaços
  drilldownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: TOKENS.ground,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.rule,
    gap: TOKENS.gap,
  },
  secondaryPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  secondaryPillButtonText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  breadcrumbBox: {
    flex: 1,
  },
  breadcrumbLabel: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
  },
  breadcrumbTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  spaceFormCard: {
    marginHorizontal: 16,
    marginTop: TOKENS.gap,
    padding: TOKENS.pad,
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionHeading: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
  },
  sectionCountText: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  spaceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.surface,
    padding: 18,
    borderRadius: TOKENS.radiusCard,
    marginBottom: TOKENS.gap,
  },
  spaceRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 10,
  },
  spaceTextColumn: {
    flex: 1,
  },
  spaceRightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  neutralDataPill: {
    backgroundColor: TOKENS.pillNeutralBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  neutralDataPillText: {
    color: TOKENS.pillNeutralInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Inventário — KPI Strip ('true-black-flat')
  kpiStripWrapper: {
    paddingHorizontal: 16,
    paddingTop: TOKENS.gap,
  },
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    paddingVertical: 16,
  },
  kpiCell: {
    flex: 1,
    paddingHorizontal: TOKENS.pad,
  },
  kpiDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: TOKENS.rule,
  },
  kpiLabel: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '400',
    marginBottom: 4,
  },
  kpiValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  kpiValue: {
    color: TOKENS.text,
    fontSize: TOKENS.fsKpi,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  kpiValueAccent: {
    color: TOKENS.accent,
  },
  kpiUnit: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontWeight: '400',
  },

  // Barra de Pesquisa do Inventário
  searchBarContainer: {
    paddingHorizontal: 16,
    paddingTop: TOKENS.gap,
    paddingBottom: 6,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusControl,
    paddingHorizontal: 16,
    height: 42,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    paddingVertical: 0,
  },
  clearSearchButton: {
    padding: 4,
  },

  // Listas e Cards do Inventário ('true-black-flat': surface #111111, radius 20, sem borda, sem sombra)
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: TOKENS.pad,
  },
  inventoryCard: {
    backgroundColor: TOKENS.surface,
    padding: TOKENS.pad,
    borderRadius: TOKENS.radiusCard,
    marginBottom: TOKENS.gap,
  },
  inventoryCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  itemInfo: {
    flex: 1,
  },
  cardTitleText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    marginBottom: 8,
  },
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.pillNeutralBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  locationPillText: {
    color: TOKENS.pillNeutralInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  barcodeMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.raised,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  barcodeMetaPillText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  cardMetaText: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },

  // Pílula de Quantidade (Marca de dados principal no card)
  quantityPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 3,
    minWidth: 64,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  quantityPillPositive: {
    backgroundColor: TOKENS.pillPositiveBg,
  },
  quantityPillWarning: {
    backgroundColor: TOKENS.pillWarningBg,
  },
  quantityPillValue: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  quantityPillUnit: {
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  quantityPillValuePositive: {
    color: TOKENS.pillPositiveInk,
  },
  quantityPillValueWarning: {
    color: TOKENS.pillWarningInk,
  },

  // Painel de Ações Rápidas (Separado por hairline 1px #161616)
  actionPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.rule,
    gap: 8,
  },
  qtyActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  actionPillText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  actionPillButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TOKENS.text,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  actionPillTextPrimary: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  actionPillButtonDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TOKENS.pillNegativeBg,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  actionPillTextDelete: {
    color: TOKENS.pillNegativeInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },

  // Estados vazios honestos (sem emojis)
  emptyState: {
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  emptySubtext: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsBody,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
});
