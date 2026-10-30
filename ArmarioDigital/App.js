import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Image,
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
  Building2,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  Layers,
  MapPin,
  Minus,
  Package,
  PackageOpen,
  Plus,
  RefreshCw,
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
import YoloCameraOverlay from './components/YoloCameraOverlay';
import { runYoloInference } from './vision/yoloAdapter';

const Tab = createBottomTabNavigator();

const STORAGE_KEY_PROFILE = '@armario_digital:user_profile';

/**
 * Contexto global de Perfil de Uso ('home' | 'business' | null)
 */
const ProfileContext = createContext({
  userProfile: null,
  selectProfile: async () => {},
  resetProfile: async () => {},
});

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

const LOTES_RAPIDOS_B2B = [1, 5, 10, 25];

function formatarNomeEspaco(espaco) {
  if (!espaco) return '';
  return espaco.parent_name
    ? `${espaco.parent_name} / ${espaco.name}`
    : espaco.name;
}

/* ==========================================================
   TELA DE ONBOARDING (Seleção de Perfil: 'home' | 'business')
   ========================================================== */
function OnboardingScreen({ onSelectProfile }) {
  const [salvandoPerfil, setSalvandoPerfil] = useState(null);

  const handleEscolher = async (perfil) => {
    if (salvandoPerfil) return;
    setSalvandoPerfil(perfil);
    try {
      await onSelectProfile(perfil);
    } finally {
      setSalvandoPerfil(null);
    }
  };

  return (
    <View style={styles.onboardingScreen}>
      <StatusBar style="light" />
      <View style={styles.onboardingContent}>
        <Text style={styles.onboardingBrand}>Armário Digital</Text>
        <Text style={styles.onboardingTitle}>
          Como você vai usar o Armário Digital?
        </Text>
        <Text style={styles.onboardingSubtitle}>
          Escolha o modo ideal para adaptar a câmera e os controles ao seu
          fluxo.
        </Text>

        <View style={styles.onboardingCardsGroup}>
          {/* Opção 1: Uso Pessoal ('home') */}
          <TouchableOpacity
            style={styles.onboardingCard}
            activeOpacity={0.82}
            onPress={() => handleEscolher('home')}
            disabled={Boolean(salvandoPerfil)}
          >
            <View style={styles.onboardingCardHeader}>
              <Home size={22} color={TOKENS.text} strokeWidth={1.5} />
              <View style={styles.onboardingModePill}>
                <Text style={styles.onboardingModePillText}>Residencial</Text>
              </View>
            </View>

            <Text style={styles.onboardingCardTitle}>
              Uso Pessoal (Organizar minha casa)
            </Text>
            <Text style={styles.onboardingCardDesc}>
              Capture fotos rápidas de objetos domésticos, roupas, ferramentas e
              caixas organizadoras por cômodo e armário.
            </Text>

            <View style={styles.onboardingActionRow}>
              <View style={styles.primaryInvertedPill}>
                <Text style={styles.primaryInvertedPillText}>
                  {salvandoPerfil === 'home'
                    ? 'Configurando...'
                    : 'Selecionar Uso Pessoal'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* Opção 2: Para meu Negócio ('business') */}
          <TouchableOpacity
            style={styles.onboardingCard}
            activeOpacity={0.82}
            onPress={() => handleEscolher('business')}
            disabled={Boolean(salvandoPerfil)}
          >
            <View style={styles.onboardingCardHeader}>
              <Building2 size={22} color={TOKENS.text} strokeWidth={1.5} />
              <View style={styles.onboardingModePillAccent}>
                <Text style={styles.onboardingModePillAccentText}>B2B</Text>
              </View>
            </View>

            <Text style={styles.onboardingCardTitle}>
              Para meu Negócio (Controle de estoque)
            </Text>
            <Text style={styles.onboardingCardDesc}>
              Leitor nativo de código de barras e QR Code com soma automática de
              SKUs e atalhos rápidos de lote.
            </Text>

            <View style={styles.onboardingActionRow}>
              <View style={styles.primaryInvertedPill}>
                <Text style={styles.primaryInvertedPillText}>
                  {salvandoPerfil === 'business'
                    ? 'Configurando...'
                    : 'Selecionar Para meu Negócio'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/* ==========================================================
   ABA 1: SCANNER (Adaptação Dinâmica: 'home' vs 'business')
   ========================================================== */
function ScannerScreen({ onInventoryUpdated }) {
  const { userProfile } = useContext(ProfileContext);
  const isHome = userProfile === 'home';
  const isBusiness = userProfile === 'business';

  const [permission, requestPermission] = useCameraPermissions();
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [yoloDetections, setYoloDetections] = useState([]);
  const [aCapturarFoto, setACapturarFoto] = useState(false);
  const [lastScannedData, setLastScannedData] = useState('');
  const lastScannedRef = useRef('');
  const processandoScanRef = useRef(false);
  const cameraRef = useRef(null);
  const inputNomeRef = useRef(null);
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
        processandoScanRef.current = false;
      };
    }, [])
  );

  // Leitura de Código de Barras (Ativo exclusivamente no perfil 'business')
  const handleBarcodeScanned = async ({ data }) => {
    if (!isBusiness) return;

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

  // Captura de fotografia nativa na CameraView via takePictureAsync() + Inferência YOLO
  const handleTirarFotoItem = async () => {
    if (aCapturarFoto || !cameraRef.current?.takePictureAsync) return;

    setACapturarFoto(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.65,
      });
      if (foto?.uri) {
        setCapturedImage(foto.uri);
        const resultadoYolo = await runYoloInference({
          uri: foto.uri,
          width: foto.width,
          height: foto.height,
          userProfile,
        });
        setYoloDetections(resultadoYolo.detections);
        Vibration.vibrate(80);
        inputNomeRef.current?.focus();
      }
    } catch (error) {
      console.error('Erro ao capturar foto do item:', error);
      Alert.alert(
        'Erro na câmara',
        'Não foi possível capturar a fotografia. Tente novamente.'
      );
    } finally {
      setACapturarFoto(false);
    }
  };

  // Aplica a sugestão do modelo YOLO conforme o perfil ('home' -> Nome | 'business' -> Lote)
  const handleAplicarSugestaoYolo = useCallback(
    (summary) => {
      if (!summary?.hasDetections) return;
      if (summary.profile === 'business') {
        setQuantidade(String(summary.suggestedQuantity));
        if (!nome.trim() && summary.suggestedItemName) {
          setNome(summary.suggestedItemName);
        }
      } else if (summary.suggestedItemName) {
        setNome(summary.suggestedItemName);
      }
      Vibration.vibrate(60);
    },
    [nome]
  );

  // Atalho de controle rápido de lote (Perfil 'business')
  const handleSomarLote = (incremento) => {
    const atual = parseInt(quantidade.replace(/[^0-9]/g, ''), 10);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 0;
    setQuantidade(String(base + incremento));
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
        isBusiness ? currentBarcode : null,
        capturedImage
      );
      const espacoEscolhido = espacos.find((e) => e.id === espacoSelecionadoId);
      const destinoTexto = espacoEscolhido
        ? ` em "${formatarNomeEspaco(espacoEscolhido)}"`
        : '';

      setNome('');
      setQuantidade('1');
      setCurrentBarcode(null);
      setCapturedImage(null);
      setYoloDetections([]);
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
            {isHome
              ? 'Conceda permissão para fotografar e catalogar os itens da sua casa.'
              : 'Conceda permissão para ler códigos EAN, UPC, Code 128 e QR Code.'}
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

    // Ciclo de vida estrito: desmonta CameraView e YoloCameraOverlay quando a aba está inativa
    return isFocused ? (
      <View style={styles.activeCameraWrapper}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={
            isBusiness
              ? {
                  barcodeTypes: [
                    'qr',
                    'ean13',
                    'ean8',
                    'upc_a',
                    'upc_e',
                    'code128',
                  ],
                }
              : undefined
          }
          onBarcodeScanned={isBusiness ? handleBarcodeScanned : undefined}
        />
        <YoloCameraOverlay
          detections={yoloDetections}
          userProfile={userProfile}
          onApplySuggestion={handleAplicarSugestaoYolo}
        />
      </View>
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

      {/* Painel adaptado dinamicamente ao perfil ('home' vs 'business') */}
      <View style={styles.scannerSheet}>
        {/* PERFIL HOME: Destaque visual para o grande botão 'Tirar Foto do Item' */}
        {isHome && (
          <View style={styles.homeCaptureSection}>
            <TouchableOpacity
              style={[
                styles.capturePhotoHeroButton,
                (!permission?.granted || aCapturarFoto) &&
                  styles.controlDisabled,
              ]}
              activeOpacity={0.85}
              onPress={handleTirarFotoItem}
              disabled={!permission?.granted || aCapturarFoto}
            >
              {aCapturarFoto ? (
                <ActivityIndicator color={TOKENS.ground} />
              ) : (
                <View style={styles.buttonContentRow}>
                  <Camera size={18} color={TOKENS.ground} strokeWidth={1.75} />
                  <Text style={styles.capturePhotoHeroButtonText}>
                    Tirar Foto do Item
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* PERFIL BUSINESS: Banner de Código de Barras Escaneado + Captura Opcional de Avatar */}
        {isBusiness && (
          <View style={styles.businessTopCaptureBar}>
            {currentBarcode ? (
              <View style={styles.scannedBarcodePillFlex}>
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
                  <X
                    size={16}
                    color={TOKENS.pillPositiveInk}
                    strokeWidth={1.5}
                  />
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.businessCameraPill,
                (!permission?.granted || aCapturarFoto) &&
                  styles.controlDisabled,
              ]}
              activeOpacity={0.82}
              onPress={handleTirarFotoItem}
              disabled={!permission?.granted || aCapturarFoto}
            >
              {aCapturarFoto ? (
                <ActivityIndicator size="small" color={TOKENS.text} />
              ) : (
                <View style={styles.buttonContentRow}>
                  <Camera size={15} color={TOKENS.text} strokeWidth={1.5} />
                  <Text style={styles.businessCameraPillText}>
                    {capturedImage ? 'Nova foto' : 'Tirar foto'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Miniatura temporária no formulário para confirmar a captura (capturedImage) */}
        {capturedImage && (
          <View style={styles.capturedPreviewContainer}>
            <Image
              source={{ uri: capturedImage }}
              style={styles.capturedPreviewThumb}
              resizeMode="cover"
              onError={() => {
                setCapturedImage(null);
                setYoloDetections([]);
              }}
            />
            <View style={styles.capturedPreviewTextCol}>
              <View style={styles.capturedPreviewStatusRow}>
                <Check
                  size={14}
                  color={TOKENS.pillPositiveInk}
                  strokeWidth={1.75}
                />
                <Text style={styles.capturedPreviewTitle} numberOfLines={1}>
                  Fotografia capturada
                </Text>
              </View>
              <Text style={styles.capturedPreviewSubtitle} numberOfLines={1}>
                Miniatura pronta para ser guardada em armazenamento permanente
              </Text>
            </View>
            <TouchableOpacity
              style={styles.capturedPreviewRemoveBtn}
              onPress={() => {
                setCapturedImage(null);
                setYoloDetections([]);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={16} color={TOKENS.muted} strokeWidth={1.5} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputRow}>
          <View style={styles.nameColumn}>
            <Text style={styles.label}>
              {isHome ? 'Nome do item doméstico' : 'Nome do produto (SKU)'}
            </Text>
            <TextInput
              ref={inputNomeRef}
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder={
                isHome
                  ? 'Ex: Casaco de Inverno, Furadeira'
                  : 'Ex: Caixa de Parafusos M6'
              }
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

        {/* PERFIL BUSINESS: Botões de controle rápido de lote */}
        {isBusiness && (
          <View style={styles.batchControlsRow}>
            <Text style={styles.batchLabel}>Lote rápido:</Text>
            <View style={styles.batchPillsGroup}>
              {LOTES_RAPIDOS_B2B.map((valor) => (
                <TouchableOpacity
                  key={valor}
                  style={styles.batchPill}
                  activeOpacity={0.78}
                  onPress={() => handleSomarLote(valor)}
                >
                  <Text style={styles.batchPillText}>+{valor}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.batchPillReset}
                activeOpacity={0.78}
                onPress={() => setQuantidade('1')}
              >
                <Text style={styles.batchPillResetText}>1 un.</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.label}>
          {isHome ? 'Guardar em qual cômodo/local?' : 'Local de armazenagem'}
        </Text>
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
            isHome ? styles.secondarySaveButton : styles.primaryInvertedButton,
            (!nomeValido || aGuardar) && styles.controlDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleSalvar}
          disabled={!nomeValido || aGuardar}
        >
          {aGuardar ? (
            <ActivityIndicator
              color={isHome ? TOKENS.text : TOKENS.ground}
            />
          ) : (
            <View style={styles.buttonContentRow}>
              <Plus
                size={16}
                color={isHome ? TOKENS.text : TOKENS.ground}
                strokeWidth={1.75}
              />
              <Text
                style={
                  isHome
                    ? styles.secondarySaveButtonText
                    : styles.primaryInvertedButtonText
                }
              >
                Salvar Item
              </Text>
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
  const { userProfile } = useContext(ProfileContext);
  const isHome = userProfile === 'home';

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
            ? isHome
              ? 'Novo cômodo principal (ex: Quarto Casal, Cozinha)'
              : 'Novo espaço principal (ex: Estoque Central)'
            : `Novo sub-espaço em "${espacoAtual?.name || ''}"`}
        </Text>
        <TextInput
          style={styles.input}
          value={nomeEspaco}
          onChangeText={setNomeEspaco}
          placeholder={
            currentParentId === null
              ? isHome
                ? 'Ex: Closet, Garagem, Despensa'
                : 'Ex: Estoque Central, Galpão 01'
              : 'Ex: Armário 1, Prateleira B, Caixa 2'
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
            ? isHome
              ? 'Cômodos principais'
              : 'Espaços principais'
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
                ) : isHome ? (
                  <Home size={18} color={TOKENS.muted} strokeWidth={1.5} />
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
                  ? isHome
                    ? 'Cadastre acima seu primeiro cômodo (ex: Quarto, Cozinha, Garagem).'
                    : 'Cadastre acima seu primeiro setor, galpão ou almoxarifado.'
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
   ABA 3: INVENTÁRIO (True-Black Flat + Busca + Optimistic UI)
   ========================================================== */
function InventarioScreen({ refreshKey }) {
  const { userProfile } = useContext(ProfileContext);
  const isHome = userProfile === 'home';

  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [aCarregar, setACarregar] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState({});

  const handleImageError = useCallback((itemId) => {
    setFailedImageIds((prev) =>
      prev[itemId] ? prev : { ...prev, [itemId]: true }
    );
  }, []);

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
            <Text style={styles.kpiLabel}>
              {isHome ? 'Objetos guardados' : 'SKUs registrados'}
            </Text>
            <View style={styles.kpiValueRow}>
              <Text style={styles.kpiValue}>{items.length}</Text>
              <Text style={styles.kpiUnit}>
                {items.length === 1 ? 'item' : 'itens'}
              </Text>
            </View>
          </View>

          <View style={styles.kpiDivider} />

          <View style={styles.kpiCell}>
            <Text style={styles.kpiLabel}>
              {isHome ? 'Total de peças' : 'Volume em estoque'}
            </Text>
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
          const imagemFalhou = Boolean(failedImageIds[item.id]);

          return (
            <View style={styles.inventoryCard}>
              {/* PERFIL HOME: Imagem de destaque de ponta a ponta no topo do card com fallback resiliente onError */}
              {isHome && item.image_uri ? (
                imagemFalhou ? (
                  <View style={styles.homeCardCoverFallback}>
                    <CameraOff
                      size={22}
                      color={TOKENS.faint}
                      strokeWidth={1.5}
                    />
                    <Text style={styles.homeCardFallbackText}>
                      Imagem local indisponível
                    </Text>
                  </View>
                ) : (
                  <Image
                    source={{ uri: item.image_uri }}
                    style={styles.homeCardCoverImage}
                    resizeMode="cover"
                    onError={() => handleImageError(item.id)}
                  />
                )
              ) : null}

              <View style={styles.inventoryCardBody}>
                {/* Linha Superior: Avatar B2B (quando aplicável) + Identificação + Metadados + Pílula de Quantidade */}
                <View style={styles.inventoryCardTopRow}>
                  {/* PERFIL BUSINESS: Miniatura circular (avatar 44x44) à esquerda do título com fallback onError */}
                  {!isHome && item.image_uri ? (
                    imagemFalhou ? (
                      <View style={styles.businessAvatarFallback}>
                        <Package
                          size={18}
                          color={TOKENS.faint}
                          strokeWidth={1.5}
                        />
                      </View>
                    ) : (
                      <Image
                        source={{ uri: item.image_uri }}
                        style={styles.businessAvatarImage}
                        resizeMode="cover"
                        onError={() => handleImageError(item.id)}
                      />
                    )
                  ) : null}

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
                      <Plus
                        size={15}
                        color={TOKENS.ground}
                        strokeWidth={1.75}
                      />
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
                  : 'Utilize a aba Scanner para registrar itens no seu armário.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

/* ==========================================================
   APP PRINCIPAL (Onboarding Inicial + Tab.Navigator Multi-Perfil)
   ========================================================== */
export default function App() {
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);

  const handleInventoryUpdated = useCallback(() => {
    setInventoryRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let ativo = true;
    async function inicializarApp() {
      try {
        const [, savedProfile] = await Promise.all([
          initDatabase(),
          AsyncStorage.getItem(STORAGE_KEY_PROFILE),
        ]);

        if (!ativo) return;
        if (savedProfile === 'home' || savedProfile === 'business') {
          setUserProfile(savedProfile);
        }
      } catch (error) {
        console.error('Erro na inicialização do aplicativo:', error);
      } finally {
        if (ativo) {
          setLoadingProfile(false);
        }
      }
    }

    inicializarApp();
    return () => {
      ativo = false;
    };
  }, []);

  const selectProfile = useCallback(async (perfil) => {
    await AsyncStorage.setItem(STORAGE_KEY_PROFILE, perfil);
    setUserProfile(perfil);
  }, []);

  const resetProfile = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY_PROFILE);
    setUserProfile(null);
  }, []);

  if (loadingProfile) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={TOKENS.text} />
      </View>
    );
  }

  // Se não houver perfil salvo no AsyncStorage, exibe a Tela de Onboarding
  if (!userProfile) {
    return <OnboardingScreen onSelectProfile={selectProfile} />;
  }

  const isHome = userProfile === 'home';

  return (
    <ProfileContext.Provider
      value={{ userProfile, selectProfile, resetProfile }}
    >
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
            headerRight: () => (
              <TouchableOpacity
                style={styles.headerProfileSwitch}
                activeOpacity={0.78}
                onPress={resetProfile}
              >
                {isHome ? (
                  <Home size={13} color={TOKENS.muted} strokeWidth={1.5} />
                ) : (
                  <Building2 size={13} color={TOKENS.accent} strokeWidth={1.5} />
                )}
                <Text style={styles.headerProfileSwitchText}>
                  {isHome ? 'Casa' : 'Negócio'}
                </Text>
                <RefreshCw size={11} color={TOKENS.faint} strokeWidth={1.5} />
              </TouchableOpacity>
            ),
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
              tabBarIcon: ({ color }) =>
                isHome ? (
                  <Camera size={18} color={color} strokeWidth={1.5} />
                ) : (
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
    </ProfileContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: TOKENS.ground,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: TOKENS.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tela de Onboarding ('true-black-flat')
  onboardingScreen: {
    flex: 1,
    backgroundColor: TOKENS.ground,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  onboardingContent: {
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
  },
  onboardingBrand: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    fontWeight: '500',
    marginBottom: 8,
  },
  onboardingTitle: {
    color: TOKENS.text,
    fontSize: 24,
    fontWeight: '600',
    lineHeight: 30,
    marginBottom: 8,
  },
  onboardingSubtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    lineHeight: 20,
    marginBottom: 24,
  },
  onboardingCardsGroup: {
    gap: TOKENS.gap,
  },
  onboardingCard: {
    backgroundColor: TOKENS.surface,
    borderRadius: TOKENS.radiusCard,
    padding: TOKENS.pad,
  },
  onboardingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  onboardingModePill: {
    backgroundColor: TOKENS.pillNeutralBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  onboardingModePillText: {
    color: TOKENS.pillNeutralInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  onboardingModePillAccent: {
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
  },
  onboardingModePillAccentText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  onboardingCardTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    marginBottom: 6,
  },
  onboardingCardDesc: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsBody,
    lineHeight: 20,
    marginBottom: 18,
  },
  onboardingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Botão de troca rápida de perfil no cabeçalho
  headerProfileSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.surface,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: TOKENS.radiusControl,
    marginRight: 14,
  },
  headerProfileSwitchText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },

  // Scanner e Câmera
  cameraContainer: {
    flex: 1,
    backgroundColor: TOKENS.ground,
  },
  activeCameraWrapper: {
    flex: 1,
    position: 'relative',
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
  homeCaptureSection: {
    marginBottom: 4,
  },
  capturePhotoHeroButton: {
    backgroundColor: TOKENS.text,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: TOKENS.gap,
  },
  capturePhotoHeroButtonText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
  },
  businessTopCaptureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: TOKENS.gap,
  },
  scannedBarcodePillFlex: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.pillPositiveBg,
    borderRadius: TOKENS.radiusControl,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  businessCameraPill: {
    backgroundColor: TOKENS.raised,
    height: TOKENS.controlHeight,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  businessCameraPillText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  capturedPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.raised,
    borderRadius: 14,
    padding: 10,
    marginBottom: TOKENS.gap,
    gap: 12,
  },
  capturedPreviewThumb: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: TOKENS.surface,
  },
  capturedPreviewTextCol: {
    flex: 1,
    gap: 2,
  },
  capturedPreviewStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  capturedPreviewTitle: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  capturedPreviewSubtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
  },
  capturedPreviewRemoveBtn: {
    padding: 4,
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
  batchControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: TOKENS.gap,
    gap: 8,
  },
  batchLabel: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  batchPillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  batchPill: {
    backgroundColor: TOKENS.raised,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: TOKENS.radiusControl,
  },
  batchPillText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  batchPillReset: {
    backgroundColor: TOKENS.pillNeutralBg,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: TOKENS.radiusControl,
  },
  batchPillResetText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
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
  secondarySaveButton: {
    backgroundColor: TOKENS.raised,
    minHeight: 42,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondarySaveButtonText: {
    color: TOKENS.text,
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
    borderRadius: TOKENS.radiusCard,
    marginBottom: TOKENS.gap,
    overflow: 'hidden',
  },
  inventoryCardBody: {
    padding: TOKENS.pad,
  },
  homeCardCoverImage: {
    width: '100%',
    height: 176,
    backgroundColor: TOKENS.raised,
  },
  homeCardCoverFallback: {
    width: '100%',
    height: 132,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  homeCardFallbackText: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  businessAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: TOKENS.radiusControl,
    backgroundColor: TOKENS.raised,
  },
  businessAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: TOKENS.radiusControl,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
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
