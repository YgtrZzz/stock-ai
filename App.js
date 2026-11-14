import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  Modal,
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
  updateSpace,
  deleteSpace,
  getSpaces,
  insertItem,
  updateItemImage,
  getItemByBarcode,
  getItems,
  getItemsBySpace,
  backfillVisualSignatures,
  bulkUpsertItemsFromCatalog,
  restoreDatabaseSnapshot,
  updateItemQuantity,
  updateItemDetails,
  applyAuditReconciliation,
  getStockMovements,
  deleteItem,
} from './database';
import { useTensorflowModel } from 'react-native-fast-tflite';
import AuditDiscrepancyModal from './components/AuditDiscrepancyModal';
import AuditHistoryCard from './components/AuditHistoryCard';
import B2BBackupRestoreCard from './components/B2BBackupRestoreCard';
import B2BStockHealthBanner from './components/B2BStockHealthBanner';
import BatchScanHudOverlay from './components/BatchScanHudOverlay';
import CsvBulkImportCard from './components/CsvBulkImportCard';
import ExportButton from './components/ExportButton';
import ForecastPurchasingCard from './components/ForecastPurchasingCard';
import PhotoLightboxModal from './components/PhotoLightboxModal';
import QuantityStepperControl from './components/QuantityStepperControl';
import ScannedBarcodeBanner from './components/ScannedBarcodeBanner';
import SpaceSelectorRow, {
  formatSpaceHierarchyName,
} from './components/SpaceSelectorRow';
import VisualRecognitionBanner from './components/VisualRecognitionBanner';
import YoloCameraOverlay from './components/YoloCameraOverlay';
import { ProfileContext } from './context/ProfileContext';
import { useKeyboardVisible } from './hooks/useKeyboardVisible';
import OnboardingScreen from './screens/OnboardingScreen';
import {
  exportSignedBackupFile,
  parseAndVerifyBackupSnapshot,
} from './utils/backupManager';
import { TOKENS } from './utils/designTokens';
import {
  generateAndShareInventoryCSV,
  generateAndShareMovementsCSV,
  generateAndSharePurchasingForecastCSV,
} from './utils/exportCsv';
import { importInventoryFromCsvText } from './utils/importCsv';
import {
  sanitizeBarcodeInput,
  sanitizeImageUriInput,
  sanitizeQuantityInput,
  sanitizeTextInput,
  validateCsvPayloadSize,
} from './utils/securityValidators';
import {
  createBatchScanSession,
  processBatchBarcodeScan,
  consolidateAuditDiscrepancies,
} from './utils/batchScanner';
import { buildYoloInputTensorFromBase64 } from './vision/imagePreprocessor';
import {
  computeVisualSignature,
  findBestVisualMatch,
  mergeVisualSignatures,
} from './vision/visualMatcher';
import {
  resolveYoloEngineStatus,
  runYoloInference,
} from './vision/yoloAdapter';

const YOLO_MODEL_ASSET = require('./assets/models/yolov8n.tflite');
const YOLO_DELEGATES = Platform.OS === 'ios' ? ['core-ml'] : [];

const Tab = createBottomTabNavigator();

const STORAGE_KEY_PROFILE = '@armario_digital:user_profile';

// Hook useKeyboardVisible modularizado em ./hooks/useKeyboardVisible (monitora keyboardDidShow / keyboardDidHide)

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

const formatarNomeEspaco = formatSpaceHierarchyName;

// Props nativas estáveis (referência fixa) evitam re-sincronizar a CameraView a cada tecla digitada
const BARCODE_SCANNER_SETTINGS_B2B = Object.freeze({
  barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128'],
});

// Resolução-alvo de captura: ~2 MP (4:3) basta para o reconhecimento visual e o YOLO 640px,
// reduzindo o JPEG/base64 de ~1,3 MB (12 MP) para ~250 KB e acelerando a análise em ~4x.
const TARGET_CAPTURE_WIDTH = 1600;

function escolherResolucaoCaptura(sizes) {
  if (!Array.isArray(sizes) || sizes.length === 0) return undefined;
  const candidatos = sizes
    .map((s) => {
      const m = /^(\d+)x(\d+)$/.exec(String(s));
      if (!m) return null;
      const w = Math.max(Number(m[1]), Number(m[2]));
      const h = Math.min(Number(m[1]), Number(m[2]));
      return { s, w, h, ratio: w / h };
    })
    .filter((c) => c && Math.abs(c.ratio - 4 / 3) < 0.02 && c.w >= 1024);
  if (candidatos.length === 0) return undefined;
  candidatos.sort(
    (a, b) =>
      Math.abs(a.w - TARGET_CAPTURE_WIDTH) - Math.abs(b.w - TARGET_CAPTURE_WIDTH)
  );
  return candidatos[0].s;
}

/* ==========================================================
   ABA 1: SCANNER (Adaptação Dinâmica: 'home' vs 'business')
   ========================================================== */
function ScannerScreen({ onInventoryUpdated }) {
  const { userProfile, openLightbox } = useContext(ProfileContext);
  const isHome = userProfile === 'home';
  const isBusiness = userProfile === 'business';
  const keyboardVisible = useKeyboardVisible();

  const [permission, requestPermission] = useCameraPermissions();
  const yoloPlugin = useTensorflowModel(YOLO_MODEL_ASSET, YOLO_DELEGATES);
  const yoloEngineStatus = resolveYoloEngineStatus(yoloPlugin);
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [currentBarcode, setCurrentBarcode] = useState(null);
  const [matchedExistingItem, setMatchedExistingItem] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [capturedVisualSignature, setCapturedVisualSignature] = useState(null);
  const [visualRecognizedMatch, setVisualRecognizedMatch] = useState(null);
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
  const [captureSize, setCaptureSize] = useState(undefined);

  // Ciclo 14: Modo Scanner Contínuo (Bipagem Rápida B2B) & Auditoria
  const [batchModeActive, setBatchModeActive] = useState(false);
  const [batchOperationMode, setBatchOperationMode] = useState('in'); // 'in' | 'out' | 'audit'
  const [batchSession, setBatchSession] = useState(() =>
    createBatchScanSession({ mode: 'inflow' })
  );
  const [lastScanFeedback, setLastScanFeedback] = useState(null);
  const [auditModalVisible, setAuditModalVisible] = useState(false);
  const [auditDiscrepanciesList, setAuditDiscrepanciesList] = useState([]);
  const batchSessionRef = useRef(batchSession);
  batchSessionRef.current = batchSession;

  const isFocused = useIsFocused();

  // Seleciona uma única vez a resolução de captura ~2 MP (4:3) suportada pelo sensor
  const handleCameraReady = useCallback(async () => {
    if (captureSize) return;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync?.();
      const escolhida = escolherResolucaoCaptura(sizes);
      if (escolhida) setCaptureSize(escolhida);
    } catch {
      // Mantém a resolução padrão do dispositivo caso a consulta não seja suportada
    }
  }, [captureSize]);

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      async function carregarEspacos() {
        try {
          const lista = await getSpaces();
          if (!ativo) return;
          setEspacos(lista);
          setEspacoSelecionadoId((atual) => {
            if (atual !== null && lista.some((e) => e.id === atual)) {
              return atual;
            }
            return null;
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

  // Passo 1 (B2B): Leitura de Código de Barras sanitizada (Unitária ou em Lote Contínuo)
  const handleBarcodeScanned = async ({ data }) => {
    if (!isBusiness) return;

    const valorLido = sanitizeBarcodeInput(data);
    if (!valorLido) return;

    // Se o Modo Scanner Contínuo estiver ativo, delega para a máquina de estado do batchScanner
    if (batchModeActive) {
      if (processandoScanRef.current) return;
      processandoScanRef.current = true;
      try {
        const itemExistente = await getItemByBarcode(valorLido);
        const map = itemExistente ? { [valorLido]: itemExistente } : {};
        const result = processBatchBarcodeScan({
          barcode: valorLido,
          itemsByBarcode: map,
          session: batchSessionRef.current,
        });

        if (result.status === 'COOLDOWN_IGNORED') {
          return;
        }

        if (result.status === 'SUCCESS') {
          Vibration.vibrate(50);
          if (batchOperationMode === 'in' || batchOperationMode === 'out') {
            await updateItemQuantity(
              result.item.id,
              result.newQuantity,
              batchOperationMode === 'in'
                ? 'entrada_lote_continuo'
                : 'saida_lote_continuo'
            );
            onInventoryUpdated?.();
          }
          setLastScanFeedback({
            type: 'success',
            barcode: valorLido,
            itemName: result.item.name,
            prevQty: result.item.quantity,
            newQty: result.newQuantity,
            delta: result.delta,
            timestamp: Date.now(),
          });
          setBatchSession({ ...batchSessionRef.current });
        } else if (result.status === 'OUT_OF_STOCK_BLOCKED') {
          Vibration.vibrate([0, 100, 50, 100]);
          setLastScanFeedback({
            type: 'blocked',
            barcode: valorLido,
            itemName: result.item.name,
            timestamp: Date.now(),
          });
        } else if (result.status === 'UNKNOWN_BARCODE') {
          Vibration.vibrate(150);
          setLastScanFeedback({
            type: 'not_found',
            barcode: valorLido,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error('Erro no processamento contínuo de barcode:', err);
      } finally {
        processandoScanRef.current = false;
      }
      return;
    }

    // Modo Padrão (Unitário B2B): prepara o formulário sem salvar automaticamente
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
      setCurrentBarcode(valorLido);

      if (itemExistente) {
        setMatchedExistingItem(itemExistente);
        setNome(String(itemExistente.name ?? ''));
        setEspacoSelecionadoId(itemExistente.space_id ?? null);
        Vibration.vibrate([0, 120, 80, 120]);
      } else {
        setMatchedExistingItem(null);
        Vibration.vibrate(100);
      }
    } catch (error) {
      console.error('Erro ao buscar item por código de barras:', error);
    } finally {
      processandoScanRef.current = false;
    }
  };

  const handleToggleBatchMode = useCallback(() => {
    setBatchModeActive((prev) => {
      const next = !prev;
      if (next) {
        const fresh = createBatchScanSession({
          mode:
            batchOperationMode === 'out'
              ? 'outflow'
              : batchOperationMode === 'audit'
              ? 'audit'
              : 'inflow',
        });
        setBatchSession(fresh);
        batchSessionRef.current = fresh;
        setLastScanFeedback(null);
      }
      return next;
    });
  }, [batchOperationMode]);

  const handleSelectBatchMode = useCallback((mode) => {
    setBatchOperationMode(mode);
    const flowMode =
      mode === 'out' ? 'outflow' : mode === 'audit' ? 'audit' : 'inflow';
    const fresh = createBatchScanSession({ mode: flowMode });
    setBatchSession(fresh);
    batchSessionRef.current = fresh;
    setLastScanFeedback(null);
  }, []);

  const handleResetBatchSession = useCallback(() => {
    const flowMode =
      batchOperationMode === 'out'
        ? 'outflow'
        : batchOperationMode === 'audit'
        ? 'audit'
        : 'inflow';
    const fresh = createBatchScanSession({ mode: flowMode });
    setBatchSession(fresh);
    batchSessionRef.current = fresh;
    setLastScanFeedback(null);
  }, [batchOperationMode]);

  const handleFinishBatch = useCallback(async () => {
    if (batchOperationMode === 'audit') {
      try {
        const todosItens = await getItems('');
        const report = consolidateAuditDiscrepancies(
          batchSessionRef.current.itemsMap,
          todosItens
        );
        setAuditDiscrepanciesList(report.discrepancies);
        setAuditModalVisible(true);
      } catch (err) {
        console.error('Erro ao consolidar auditoria:', err);
      }
      return;
    }

    Alert.alert(
      'Lote Finalizado',
      `${batchSession.scannedCount} leituras processadas com sucesso.`
    );
    handleResetBatchSession();
  }, [batchOperationMode, batchSession.scannedCount, handleResetBatchSession]);

  const handleApplyAuditAdjustment = useCallback(async () => {
    try {
      const res = await applyAuditReconciliation(auditDiscrepanciesList);
      setAuditModalVisible(false);
      onInventoryUpdated?.();
      Alert.alert(
        'Inventário Ajustado',
        `${res.adjustedCount} saldos foram atualizados no estoque.`
      );
      handleResetBatchSession();
    } catch (err) {
      console.error('Erro ao aplicar ajuste de auditoria:', err);
      Alert.alert('Erro', 'Não foi possível atualizar os saldos divergentes.');
    }
  }, [auditDiscrepanciesList, handleResetBatchSession, onInventoryUpdated]);

  const handleQuickCreateUnregistered = useCallback((barcode) => {
    setBatchModeActive(false);
    setCurrentBarcode(barcode);
    setNome('');
    setMatchedExistingItem(null);
  }, []);

  // Passo 1: Captura de fotografia nativa na CameraView + Pré-processamento de Tensor + Inferência YOLO
  const handleTirarFotoItem = async () => {
    if (aCapturarFoto || !cameraRef.current?.takePictureAsync) return;

    setACapturarFoto(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (foto?.uri) {
        setCapturedImage(foto.uri);
        setACapturarFoto(false);
        Vibration.vibrate(80);

        // Libera um frame de UI (60 FPS) para exibir a foto instantaneamente antes do processamento IA
        await new Promise((resolve) => setTimeout(resolve, 24));

        const modeloTflite =
          yoloPlugin.state === 'loaded' ? yoloPlugin.model : null;
        const tensorBuffer = foto.base64
          ? buildYoloInputTensorFromBase64(
              foto.base64,
              modeloTflite?.inputs?.[0]
            )
          : null;

        const resultadoYolo = await runYoloInference(
          {
            uri: foto.uri,
            width: foto.width,
            height: foto.height,
            userProfile,
            tensorBuffer,
          },
          modeloTflite
        );
        setYoloDetections(resultadoYolo.detections);

        // Reconhecimento Visual por Foto + Assinatura YOLO (identifica nome, local e código de itens já cadastrados)
        const novaAssinatura = foto.base64
          ? computeVisualSignature({
              base64: foto.base64,
              detections: resultadoYolo.detections,
            })
          : null;
        setCapturedVisualSignature(novaAssinatura);

        if (novaAssinatura) {
          const itensCadastrados = await getItems('');
          const matchVisual = findBestVisualMatch(
            novaAssinatura,
            itensCadastrados
          );
          if (matchVisual?.item) {
            setVisualRecognizedMatch(matchVisual);
            setMatchedExistingItem(matchVisual.item);
            setNome(String(matchVisual.item.name ?? ''));
            if (matchVisual.item.space_id !== undefined) {
              setEspacoSelecionadoId(matchVisual.item.space_id ?? null);
            }
            if (matchVisual.item.barcode) {
              setCurrentBarcode(matchVisual.item.barcode);
              setLastScannedData(matchVisual.item.barcode);
            }
            Vibration.vibrate([0, 90, 60, 90]);
          } else {
            if (visualRecognizedMatch) {
              setMatchedExistingItem(null);
              setNome('');
              setEspacoSelecionadoId(null);
              setCurrentBarcode(null);
            }
            setVisualRecognizedMatch(null);
          }
        }
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

  // Passo 2: Ajuste de quantidade por stepper (- / +) ou lote rápido
  const handleAjustarQuantidade = (delta) => {
    const atual = parseInt(quantidade.replace(/[^0-9]/g, ''), 10);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 1;
    const proximo = Math.max(1, base + delta);
    setQuantidade(String(proximo));
  };

  const handleSomarLote = (incremento) => {
    const atual = parseInt(quantidade.replace(/[^0-9]/g, ''), 10);
    const base = Number.isFinite(atual) && atual > 0 ? atual : 0;
    setQuantidade(String(base + incremento));
  };

  const nomeValido = nome.trim().length > 0;

  // Passo 4: Único gatilho que efetivamente salva/atualiza o item no SQLite (com sanitização OWASP)
  const handleSalvar = async () => {
    const nomeLimpo = sanitizeTextInput(nome, 60);
    if (!nomeLimpo || aGuardar) return;

    const qtdFinal = Math.max(1, sanitizeQuantityInput(quantidade, 1, 99999));
    const barcodeSeguro = sanitizeBarcodeInput(currentBarcode) || null;
    const imagemSegura = sanitizeImageUriInput(capturedImage);
    const correspondeAoExistente = Boolean(
      matchedExistingItem &&
        ((isBusiness && barcodeSeguro && barcodeSeguro === matchedExistingItem.barcode) ||
          nomeLimpo.toLowerCase() ===
            String(matchedExistingItem.name ?? '').trim().toLowerCase())
    );

    setAGuardar(true);
    try {
      if (correspondeAoExistente && matchedExistingItem) {
        const novaQtdTotal = Math.min(
          99999,
          Number(matchedExistingItem.quantity ?? 0) + qtdFinal
        );
        await updateItemQuantity(
          matchedExistingItem.id,
          novaQtdTotal,
          'entrada_estoque'
        );
        await updateItemDetails(matchedExistingItem.id, {
          name: nomeLimpo,
          space_id: espacoSelecionadoId,
          barcode: barcodeSeguro || matchedExistingItem.barcode || null,
          image_uri: imagemSegura || matchedExistingItem.image_uri || null,
          visual_signature: capturedVisualSignature
            ? mergeVisualSignatures(
                matchedExistingItem.visual_signature,
                capturedVisualSignature
              )
            : matchedExistingItem.visual_signature || null,
        });
      } else {
        await insertItem(
          nomeLimpo,
          espacoSelecionadoId,
          qtdFinal,
          barcodeSeguro,
          imagemSegura,
          capturedVisualSignature
        );
      }

      const espacoEscolhido = espacos.find((e) => e.id === espacoSelecionadoId);
      const destinoTexto = espacoEscolhido
        ? ` em "${formatarNomeEspaco(espacoEscolhido)}"`
        : ' (Sem local definido)';

      const eraExistente = correspondeAoExistente;

      setNome('');
      setQuantidade('1');
      setEspacoSelecionadoId(null);
      setCurrentBarcode(null);
      setMatchedExistingItem(null);
      setCapturedImage(null);
      setCapturedVisualSignature(null);
      setVisualRecognizedMatch(null);
      setYoloDetections([]);
      lastScannedRef.current = '';
      setLastScannedData('');
      processandoScanRef.current = false;
      Keyboard.dismiss();
      onInventoryUpdated?.();

      Alert.alert(
        eraExistente ? 'Estoque atualizado' : 'Item salvo com sucesso',
        eraExistente
          ? `+${qtdFinal} un. somadas a "${nomeLimpo}"${destinoTexto}.`
          : `${qtdFinal}x "${nomeLimpo}" registrado${destinoTexto}.`
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

    // Quando já há uma fotografia capturada, exibe a própria foto limpa e sem obstruções no estúdio óptico
    if (capturedImage) {
      return (
        <View style={styles.capturedStageWrapper}>
          <TouchableOpacity
            style={styles.capturedStageTouch}
            activeOpacity={0.9}
            onPress={() =>
              openLightbox(capturedImage, nome.trim() || 'Foto capturada')
            }
          >
            <Image
              source={{ uri: capturedImage }}
              style={styles.capturedStageImage}
              resizeMode="contain"
              onError={() => {
                setCapturedImage(null);
                setYoloDetections([]);
              }}
            />
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
          pictureSize={captureSize}
          onCameraReady={handleCameraReady}
          barcodeScannerSettings={
            isBusiness ? BARCODE_SCANNER_SETTINGS_B2B : undefined
          }
          onBarcodeScanned={isBusiness ? handleBarcodeScanned : undefined}
        />
        {/* Cantoneiras ópticas de enquadramento (Retículo) */}
        <View style={styles.opticalReticleLayer} pointerEvents="none">
          <View style={[styles.opticalCorner, styles.opticalCornerTL]} />
          <View style={[styles.opticalCorner, styles.opticalCornerTR]} />
          <View style={[styles.opticalCorner, styles.opticalCornerBL]} />
          <View style={[styles.opticalCorner, styles.opticalCornerBR]} />
        </View>

        <YoloCameraOverlay
          detections={yoloDetections}
          userProfile={userProfile}
          onApplySuggestion={handleAplicarSugestaoYolo}
        />

        {isBusiness && (
          <BatchScanHudOverlay
            enabled={batchModeActive}
            onToggleEnabled={handleToggleBatchMode}
            operationMode={batchOperationMode}
            onSelectOperationMode={handleSelectBatchMode}
            lastScanFeedback={lastScanFeedback}
            sessionStats={{
              totalBips: batchSession.scannedCount,
              totalSkus: batchSession.uniqueItemsCount,
            }}
            onResetSession={handleResetBatchSession}
            onFinishBatch={handleFinishBatch}
            onOpenQuickCreate={handleQuickCreateUnregistered}
          />
        )}
      </View>
    ) : (
      <View style={styles.cameraPlaceholder} />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 76}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scannerScrollContent,
          keyboardVisible && styles.scrollContentKeyboardActive,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Estúdio de Câmera Limpo: Visor Óptico + Botão de Captura Embaixo */}
        <View style={styles.cameraStageCard}>
          <View style={styles.cameraContainer}>{renderCamera()}</View>

          {/* Botão de Captura na base (limpo, direto e consistente em Casa e Negócio) */}
          <View style={styles.cameraShutterDock}>
            {!capturedImage ? (
              <TouchableOpacity
                style={[
                  styles.shutterDockPrimaryButton,
                  (!permission?.granted || aCapturarFoto) &&
                    styles.controlDisabled,
                ]}
                activeOpacity={0.86}
                onPress={handleTirarFotoItem}
                disabled={!permission?.granted || aCapturarFoto}
              >
                <View style={styles.shutterEmblemOuter}>
                  <View style={styles.shutterEmblemInner}>
                    {aCapturarFoto ? (
                      <ActivityIndicator size="small" color={TOKENS.ground} />
                    ) : (
                      <Camera
                        size={16}
                        color={TOKENS.ground}
                        strokeWidth={2}
                      />
                    )}
                  </View>
                </View>

                <View style={styles.shutterDockTextCol}>
                  <Text style={styles.shutterDockTitle}>
                    {aCapturarFoto
                      ? 'Capturando foto...'
                      : isHome
                        ? 'Tirar Foto do Item'
                        : 'Tirar Foto do Produto'}
                  </Text>
                  <Text style={styles.shutterDockSubtitle} numberOfLines={1}>
                    {isHome
                      ? 'Toque aqui para fotografar o item'
                      : 'Aponte para o código de barras ou toque para fotografar'}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.capturedDockActionsRow}>
                <TouchableOpacity
                  style={styles.capturedDockSecondaryBtn}
                  activeOpacity={0.82}
                  onPress={() =>
                    openLightbox(
                      capturedImage,
                      nome.trim() || 'Foto capturada'
                    )
                  }
                >
                  <Search size={15} color={TOKENS.text} strokeWidth={1.75} />
                  <Text style={styles.capturedDockSecondaryBtnText}>
                    Ampliar Foto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.capturedDockPrimaryBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    setCapturedImage(null);
                    setCapturedVisualSignature(null);
                    if (visualRecognizedMatch) {
                      setMatchedExistingItem(null);
                      setNome('');
                      setEspacoSelecionadoId(null);
                      setCurrentBarcode(null);
                    }
                    setVisualRecognizedMatch(null);
                    setYoloDetections([]);
                    Vibration.vibrate(40);
                  }}
                >
                  <RefreshCw
                    size={15}
                    color={TOKENS.ground}
                    strokeWidth={2}
                  />
                  <Text style={styles.capturedDockPrimaryBtnText}>
                    Tirar Outra Foto
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* Painel Guiado em 4 Passos: 1. Nome/Código -> 2. Quantidade -> 3. Local -> 4. Salvar Item */}
        <View style={styles.scannerSheet}>
          <View style={styles.stepHeaderRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberBadgeText}>1</Text>
            </View>
            <Text style={styles.stepHeaderTitle}>
              {isHome
                ? 'Identificar o item'
                : 'Identificar produto ou código SKU'}
            </Text>
          </View>

          {/* Banner Memoizado de Reconhecimento Visual por Foto (reconhece nome, local e código de item já salvo) */}
          <VisualRecognitionBanner
            match={visualRecognizedMatch}
            onDismiss={() => {
              setVisualRecognizedMatch(null);
              setMatchedExistingItem(null);
              setNome('');
              setEspacoSelecionadoId(null);
              setCurrentBarcode(null);
              lastScannedRef.current = '';
              setLastScannedData('');
            }}
          />

          {/* Banner Memoizado de Código de Barras Escaneado no Perfil Business */}
          {isBusiness ? (
            <ScannedBarcodeBanner
              barcode={currentBarcode}
              matchedExistingItem={matchedExistingItem}
              onDismiss={() => {
                setCurrentBarcode(null);
                setMatchedExistingItem(null);
                lastScannedRef.current = '';
                setLastScannedData('');
                processandoScanRef.current = false;
              }}
            />
          ) : null}

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
            onSubmitEditing={() => Keyboard.dismiss()}
            editable={!aGuardar}
          />

          {/* PASSO 2: DEFINIR QUANTIDADE */}
          <View style={styles.stepHeaderRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberBadgeText}>2</Text>
            </View>
            <Text style={styles.stepHeaderTitle}>
              {matchedExistingItem
                ? 'Quantidade a adicionar ao estoque'
                : 'Definir quantidade'}
            </Text>
          </View>

          <QuantityStepperControl
            quantity={quantidade}
            onChangeQuantity={setQuantidade}
            onAdjustQuantity={handleAjustarQuantidade}
            onAddBatch={handleSomarLote}
            disabled={aGuardar}
          />

          {/* PASSO 3: ESCOLHER LOCAL DE ARMAZENAGEM */}
          <View style={styles.stepHeaderRow}>
            <View style={styles.stepNumberBadge}>
              <Text style={styles.stepNumberBadgeText}>3</Text>
            </View>
            <Text style={styles.stepHeaderTitle}>
              {isHome
                ? 'Escolher cômodo ou local'
                : 'Escolher local de armazenagem'}
            </Text>
          </View>
          <SpaceSelectorRow
            spaces={espacos}
            selectedSpaceId={espacoSelecionadoId}
            onSelectSpace={setEspacoSelecionadoId}
          />

          {/* PASSO 4: CONFIRMAR E SALVAR ITEM */}
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
                <Check size={17} color={TOKENS.ground} strokeWidth={2} />
                <Text style={styles.primaryInvertedButtonText}>
                  {matchedExistingItem
                    ? `Somar +${quantidade || '1'} un. e Salvar`
                    : 'Salvar Item no Armário'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      <AuditDiscrepancyModal
        visible={auditModalVisible}
        items={auditDiscrepanciesList}
        onClose={() => setAuditModalVisible(false)}
        onApplyStockAdjustment={handleApplyAuditAdjustment}
      />
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 2: ESPAÇOS (Mapa Visual + Drill-down em True-Black Flat)
   ========================================================== */
function EspacosScreen() {
  const { userProfile, openLightbox } = useContext(ProfileContext);
  const isHome = userProfile === 'home';
  const keyboardVisible = useKeyboardVisible();

  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const spaceCameraRef = useRef(null);

  const [espacos, setEspacos] = useState([]);
  const [itensNoEspaco, setItensNoEspaco] = useState([]);
  const [currentParentId, setCurrentParentId] = useState(null);
  const [nomeEspaco, setNomeEspaco] = useState('');
  const [capturedSpaceImage, setCapturedSpaceImage] = useState(null);
  const [editingSpace, setEditingSpace] = useState(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [aCapturarFotoEspaco, setACapturarFotoEspaco] = useState(false);
  const [failedSpaceImageIds, setFailedSpaceImageIds] = useState({});
  const [failedSpaceItemImageIds, setFailedSpaceItemImageIds] = useState({});
  const [aCarregar, setACarregar] = useState(false);
  const [aCriar, setACriar] = useState(false);

  const handleSpaceImageError = useCallback((spaceId) => {
    setFailedSpaceImageIds((prev) =>
      prev[spaceId] ? prev : { ...prev, [spaceId]: true }
    );
  }, []);

  const handleSpaceItemImageError = useCallback((itemId) => {
    setFailedSpaceItemImageIds((prev) =>
      prev[itemId] ? prev : { ...prev, [itemId]: true }
    );
  }, []);

  const carregarEspacos = useCallback(async () => {
    setACarregar(true);
    try {
      const [lista, itensLocal] = await Promise.all([
        getSpaces(),
        currentParentId !== null
          ? getItemsBySpace(currentParentId)
          : Promise.resolve([]),
      ]);
      setEspacos(lista);
      setItensNoEspaco(itensLocal);
    } catch (error) {
      console.error('Erro ao listar espaços:', error);
    } finally {
      setACarregar(false);
    }
  }, [currentParentId]);

  useEffect(() => {
    let ativo = true;
    async function carregarItensDoEspaco() {
      if (currentParentId === null) {
        setItensNoEspaco([]);
        return;
      }
      try {
        const itensLocal = await getItemsBySpace(currentParentId);
        if (ativo) {
          setItensNoEspaco(itensLocal);
        }
      } catch (error) {
        console.error('Erro ao carregar itens do espaço selecionado:', error);
      }
    }
    carregarItensDoEspaco();
    return () => {
      ativo = false;
    };
  }, [currentParentId]);

  useFocusEffect(
    useCallback(() => {
      carregarEspacos();
      return () => {
        // Desmonta a câmera de espaços ao sair da aba para não drenar bateria
        setCameraAberta(false);
      };
    }, [carregarEspacos])
  );

  const espacoAtual = espacos.find((e) => e.id === currentParentId) || null;
  const espacosFiltrados = espacos.filter(
    (e) => (e.parent_id ?? null) === currentParentId
  );

  const nomeValido = nomeEspaco.trim().length > 0;

  const handleVoltar = () => {
    setEditingSpace(null);
    setNomeEspaco('');
    setCapturedSpaceImage(null);
    setCameraAberta(false);
    if (espacoAtual) {
      setCurrentParentId(espacoAtual.parent_id ?? null);
    } else {
      setCurrentParentId(null);
    }
  };

  const handleAbrirCameraEspaco = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res?.granted) return;
    }
    setCameraAberta((prev) => !prev);
  };

  const handleTirarFotoEspaco = async () => {
    if (aCapturarFotoEspaco || !spaceCameraRef.current?.takePictureAsync) {
      return;
    }

    setACapturarFotoEspaco(true);
    try {
      const foto = await spaceCameraRef.current.takePictureAsync({
        quality: 0.65,
      });
      if (foto?.uri) {
        setCapturedSpaceImage(foto.uri);
        setCameraAberta(false);
        Vibration.vibrate(80);
      }
    } catch (error) {
      console.error('Erro ao capturar foto do espaço:', error);
      Alert.alert(
        'Erro na câmara',
        'Não foi possível fotografar o espaço. Tente novamente.'
      );
    } finally {
      setACapturarFotoEspaco(false);
    }
  };

  const handleIniciarEdicaoEspaco = async (espaco, abrirCameraDireto = false) => {
    setEditingSpace(espaco);
    setNomeEspaco(espaco.name);
    setCapturedSpaceImage(espaco.image_uri || null);
    if (abrirCameraDireto) {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res?.granted) return;
      }
      setCameraAberta(true);
    }
  };

  const handleCancelarEdicaoEspaco = () => {
    setEditingSpace(null);
    setNomeEspaco('');
    setCapturedSpaceImage(null);
    setCameraAberta(false);
  };

  const handleExcluirEspaco = (espaco) => {
    if (!espaco || aCriar) return;

    Alert.alert(
      'Excluir local com segurança',
      `Deseja excluir "${espaco.name}"? Os itens e sub-divisões não serão perdidos (serão realocados automaticamente para o nível superior).`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir local',
          style: 'destructive',
          onPress: async () => {
            setACriar(true);
            try {
              await deleteSpace(espaco.id);
              handleCancelarEdicaoEspaco();
              await carregarEspacos();
            } catch (error) {
              console.error('Erro ao excluir espaço:', error);
              Alert.alert('Erro', 'Não foi possível excluir o local.');
            } finally {
              setACriar(false);
            }
          },
        },
      ]
    );
  };

  const handleAdicionarEspaco = async () => {
    const nomeLimpo = nomeEspaco.trim();
    if (!nomeLimpo || aCriar) return;

    setACriar(true);
    try {
      if (editingSpace) {
        const atualizado = await updateSpace(editingSpace.id, {
          name: nomeLimpo,
          image_uri: capturedSpaceImage,
        });
        setEspacos((prev) =>
          prev.map((item) =>
            item.id === editingSpace.id
              ? {
                  ...item,
                  name: atualizado.name,
                  image_uri: atualizado.image_uri,
                }
              : item
          )
        );
        setFailedSpaceImageIds((prev) => {
          if (!prev[editingSpace.id]) return prev;
          const copia = { ...prev };
          delete copia[editingSpace.id];
          return copia;
        });
        setEditingSpace(null);
      } else {
        await addSpace(nomeLimpo, currentParentId, capturedSpaceImage);
        await carregarEspacos();
      }

      setNomeEspaco('');
      setCapturedSpaceImage(null);
      setCameraAberta(false);
      Keyboard.dismiss();
    } catch (error) {
      console.error('Erro ao salvar espaço:', error);
      Alert.alert('Erro', 'Não foi possível guardar o espaço.');
    } finally {
      setACriar(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 76}
    >
      <FlatList
        data={espacosFiltrados}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={carregarEspacos}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={[
          styles.listContent,
          keyboardVisible && styles.scrollContentKeyboardActive,
        ]}
        ListHeaderComponent={
          <View>
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
              <View style={styles.spaceFormHeaderRow}>
                <Text style={[styles.label, styles.spaceFormLabelFlex]}>
                  {editingSpace
                    ? `Editando local: "${editingSpace.name}"`
                    : currentParentId === null
                      ? isHome
                        ? 'Novo cômodo principal (Mapa Visual)'
                        : 'Novo espaço principal (ex: Estoque Central)'
                      : `Novo sub-espaço em "${espacoAtual?.name || ''}"`}
                </Text>

                <TouchableOpacity
                  style={styles.businessCameraPill}
                  activeOpacity={0.82}
                  onPress={handleAbrirCameraEspaco}
                >
                  <View style={styles.buttonContentRow}>
                    <Camera size={14} color={TOKENS.text} strokeWidth={1.5} />
                    <Text style={styles.businessCameraPillText}>
                      {cameraAberta
                        ? 'Fechar câmara'
                        : capturedSpaceImage
                          ? 'Trocar foto'
                          : 'Fotografar local'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Visor de Estúdio Óptico limpo com botão de captura abaixo do enquadramento */}
              {cameraAberta && isFocused && permission?.granted && (
                <View style={styles.spaceCameraSection}>
                  <View style={styles.spaceCameraBox}>
                    <CameraView
                      ref={spaceCameraRef}
                      style={styles.spaceCameraPreview}
                      facing="back"
                    />
                    <View
                      style={styles.opticalReticleLayer}
                      pointerEvents="none"
                    >
                      <View
                        style={[styles.opticalCorner, styles.opticalCornerTL]}
                      />
                      <View
                        style={[styles.opticalCorner, styles.opticalCornerTR]}
                      />
                      <View
                        style={[styles.opticalCorner, styles.opticalCornerBL]}
                      />
                      <View
                        style={[styles.opticalCorner, styles.opticalCornerBR]}
                      />
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.shutterDockPrimaryButton,
                      aCapturarFotoEspaco && styles.controlDisabled,
                    ]}
                    activeOpacity={0.85}
                    onPress={handleTirarFotoEspaco}
                    disabled={aCapturarFotoEspaco}
                  >
                    <View style={styles.shutterEmblemOuter}>
                      <View style={styles.shutterEmblemInner}>
                        {aCapturarFotoEspaco ? (
                          <ActivityIndicator
                            size="small"
                            color={TOKENS.ground}
                          />
                        ) : (
                          <Camera
                            size={16}
                            color={TOKENS.ground}
                            strokeWidth={2}
                          />
                        )}
                      </View>
                    </View>
                    <View style={styles.shutterDockTextCol}>
                      <Text style={styles.shutterDockTitle}>
                        {aCapturarFotoEspaco
                          ? 'Capturando foto...'
                          : 'Tirar Foto do Local'}
                      </Text>
                      <Text style={styles.shutterDockSubtitle}>
                        Toque aqui para fotografar o espaço
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {/* Miniatura estúdio sem corte da foto do espaço antes de guardar */}
              {capturedSpaceImage && (
                <View style={styles.capturedPreviewContainer}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() =>
                      openLightbox?.(
                        capturedSpaceImage,
                        nomeEspaco.trim() || 'Foto do local'
                      )
                    }
                  >
                    <Image
                      source={{ uri: capturedSpaceImage }}
                      style={styles.capturedPreviewThumb}
                      resizeMode="contain"
                      onError={() => setCapturedSpaceImage(null)}
                    />
                  </TouchableOpacity>
                  <View style={styles.capturedPreviewTextCol}>
                    <View style={styles.capturedPreviewStatusRow}>
                      <Check
                        size={14}
                        color={TOKENS.pillPositiveInk}
                        strokeWidth={1.75}
                      />
                      <Text
                        style={styles.capturedPreviewTitle}
                        numberOfLines={1}
                      >
                        Foto do local pronta (toque para ampliar)
                      </Text>
                    </View>
                    <Text
                      style={styles.capturedPreviewSubtitle}
                      numberOfLines={1}
                    >
                      Enquadramento integral sem corte no Mapa Visual
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.capturedPreviewRemoveBtn}
                    onPress={() => setCapturedSpaceImage(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <X size={16} color={TOKENS.muted} strokeWidth={1.5} />
                  </TouchableOpacity>
                </View>
              )}

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

              <View style={styles.spaceFormButtonsRow}>
                {editingSpace && (
                  <>
                    <TouchableOpacity
                      style={styles.secondaryPillButton}
                      activeOpacity={0.8}
                      onPress={handleCancelarEdicaoEspaco}
                      disabled={aCriar}
                    >
                      <X size={14} color={TOKENS.text} strokeWidth={1.5} />
                      <Text style={styles.secondaryPillButtonText}>
                        Cancelar
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionPillButtonDelete}
                      activeOpacity={0.8}
                      onPress={() => handleExcluirEspaco(editingSpace)}
                      disabled={aCriar}
                    >
                      <Trash2
                        size={14}
                        color={TOKENS.pillNegativeInk}
                        strokeWidth={1.5}
                      />
                      <Text style={styles.actionPillTextDelete}>Excluir</Text>
                    </TouchableOpacity>
                  </>
                )}

                <TouchableOpacity
                  style={[
                    styles.primaryInvertedButton,
                    styles.spaceSubmitButtonFlex,
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
                      {editingSpace ? (
                        <Check
                          size={16}
                          color={TOKENS.ground}
                          strokeWidth={1.75}
                        />
                      ) : (
                        <Plus
                          size={16}
                          color={TOKENS.ground}
                          strokeWidth={1.75}
                        />
                      )}
                      <Text style={styles.primaryInvertedButtonText}>
                        {editingSpace
                          ? 'Guardar Alterações'
                          : currentParentId === null
                            ? 'Cadastrar Espaço'
                            : 'Cadastrar Sub-espaço'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
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
          </View>
        }
        renderItem={({ item }) => {
          const qtdSubespacos = espacos.filter(
            (sub) => sub.parent_id === item.id
          ).length;
          const qtdItens = item.item_count ?? 0;
          const imagemLocalFalhou = Boolean(failedSpaceImageIds[item.id]);

          return (
            <TouchableOpacity
              style={styles.spaceCard}
              activeOpacity={0.82}
              onPress={() => setCurrentParentId(item.id)}
            >
              <View style={styles.spaceCardBody}>
                <View style={styles.spaceRowLeft}>
                  {/* Miniatura de estúdio sem corte do espaço (toque amplia) ou ícone do local */}
                  {item.image_uri && !imagemLocalFalhou ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => openLightbox?.(item.image_uri, item.name)}
                    >
                      <Image
                        source={{ uri: item.image_uri }}
                        style={styles.spaceThumbImage}
                        resizeMode="contain"
                        onError={() => handleSpaceImageError(item.id)}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.spaceThumbFallback}>
                      {item.parent_id ? (
                        <Folder
                          size={20}
                          color={TOKENS.muted}
                          strokeWidth={1.5}
                        />
                      ) : isHome ? (
                        <Home
                          size={20}
                          color={TOKENS.muted}
                          strokeWidth={1.5}
                        />
                      ) : (
                        <Warehouse
                          size={20}
                          color={TOKENS.muted}
                          strokeWidth={1.5}
                        />
                      )}
                    </View>
                  )}
                  <View style={styles.spaceTextColumn}>
                    <Text style={styles.cardTitleText} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.cardMetaText}>
                      {qtdSubespacos > 0
                        ? `${qtdSubespacos} ${qtdSubespacos === 1 ? 'sub-divisão' : 'sub-divisões'} · Toque para abrir`
                        : 'Toque para ver itens e divisões'}
                    </Text>
                  </View>
                </View>

                <View style={styles.spaceRightBox}>
                  <TouchableOpacity
                    style={styles.spacePhotoActionPill}
                    activeOpacity={0.78}
                    onPress={() => handleIniciarEdicaoEspaco(item, true)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Camera size={13} color={TOKENS.text} strokeWidth={1.5} />
                    <Text style={styles.spacePhotoActionText}>
                      {item.image_uri ? 'Editar' : 'Foto'}
                    </Text>
                  </TouchableOpacity>

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
                  : 'Você pode adicionar sub-divisões acima ou conferir os itens guardados abaixo.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          currentParentId !== null ? (
            <View style={styles.spaceSavedItemsSection}>
              <View style={styles.spaceSavedItemsHeaderRow}>
                <View style={styles.spaceSavedItemsTitleRow}>
                  <Package size={16} color={TOKENS.text} strokeWidth={1.75} />
                  <Text style={styles.sectionHeading}>
                    Itens guardados neste local
                  </Text>
                </View>
                <View style={styles.neutralDataPill}>
                  <Text style={styles.neutralDataPillText}>
                    {itensNoEspaco.length}{' '}
                    {itensNoEspaco.length === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
              </View>

              {itensNoEspaco.length === 0 ? (
                <View style={styles.spaceSavedItemsEmptyCard}>
                  <PackageOpen
                    size={22}
                    color={TOKENS.faint}
                    strokeWidth={1.5}
                  />
                  <Text style={styles.spaceSavedItemsEmptyText}>
                    Nenhum item guardado diretamente neste local
                  </Text>
                  <Text style={styles.spaceSavedItemsEmptySubtext}>
                    Ao escanear ou fotografar um item na aba Scanner, escolha "
                    {espacoAtual?.name || 'este local'}" para vê-lo listado aqui.
                  </Text>
                </View>
              ) : (
                itensNoEspaco.map((savedItem) => {
                  const qtdItem = Number(savedItem.quantity ?? 1);
                  const semEstoque = qtdItem === 0;
                  const imgFalhou = Boolean(
                    failedSpaceItemImageIds[savedItem.id]
                  );

                  return (
                    <View
                      key={String(savedItem.id)}
                      style={styles.spaceSavedItemCard}
                    >
                      {savedItem.image_uri && !imgFalhou ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            openLightbox?.(savedItem.image_uri, savedItem.name)
                          }
                        >
                          <Image
                            source={{ uri: savedItem.image_uri }}
                            style={styles.spaceSavedItemThumb}
                            resizeMode="contain"
                            onError={() =>
                              handleSpaceItemImageError(savedItem.id)
                            }
                          />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.spaceSavedItemThumbFallback}>
                          <Package
                            size={18}
                            color={TOKENS.faint}
                            strokeWidth={1.5}
                          />
                        </View>
                      )}

                      <View style={styles.spaceSavedItemInfoCol}>
                        <Text
                          style={styles.spaceSavedItemTitle}
                          numberOfLines={1}
                        >
                          {savedItem.name}
                        </Text>
                        {savedItem.barcode ? (
                          <View style={styles.barcodeMetaPill}>
                            <Barcode
                              size={11}
                              color={TOKENS.faint}
                              strokeWidth={1.5}
                            />
                            <Text
                              style={styles.barcodeMetaPillText}
                              numberOfLines={1}
                            >
                              {savedItem.barcode}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.cardMetaText}>
                            Guardado em {espacoAtual?.name || 'local selecionado'}
                          </Text>
                        )}
                      </View>

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
                          {qtdItem}
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
                  );
                })
              )}
            </View>
          ) : null
        }
      />
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 3: INVENTÁRIO (True-Black Flat + Busca + Optimistic UI)
   ========================================================== */
function InventarioScreen({ refreshKey }) {
  const { userProfile, openLightbox } = useContext(ProfileContext);
  const isHome = userProfile === 'home';
  const keyboardVisible = useKeyboardVisible();
  const [permission, requestPermission] = useCameraPermissions();
  const isFocused = useIsFocused();
  const inventoryCameraRef = useRef(null);

  const [items, setItems] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [showCsvImportPanel, setShowCsvImportPanel] = useState(false);
  const [showAuditLogPanel, setShowAuditLogPanel] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');
  const [aImportarCsv, setAImportarCsv] = useState(false);
  const [aCarregar, setACarregar] = useState(false);
  const [aExportar, setAExportar] = useState(false);
  const [aExportarAuditoria, setAExportarAuditoria] = useState(false);
  const [aExportarPrevisao, setAExportarPrevisao] = useState(false);
  const [aExportarBackup, setAExportarBackup] = useState(false);
  const [aRestaurarBackup, setARestaurarBackup] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemName, setEditingItemName] = useState('');
  const [editingItemMinQty, setEditingItemMinQty] = useState('3');
  const [editingItemSpaceId, setEditingItemSpaceId] = useState(null);
  const [editingItemImageUri, setEditingItemImageUri] = useState(null);
  const [editingItemVisualSig, setEditingItemVisualSig] = useState(undefined);
  const [inventoryCameraOpen, setInventoryCameraOpen] = useState(false);
  const [aCapturarFotoItem, setACapturarFotoItem] = useState(false);
  const [aSalvarEdicaoItem, setASalvarEdicaoItem] = useState(false);
  const [failedImageIds, setFailedImageIds] = useState({});

  const handleImageError = useCallback((itemId) => {
    setFailedImageIds((prev) =>
      prev[itemId] ? prev : { ...prev, [itemId]: true }
    );
  }, []);

  const carregarItens = useCallback(async (termoBusca = '') => {
    setACarregar(true);
    try {
      const [data, listaEspacos, historico] = await Promise.all([
        getItems(termoBusca),
        getSpaces(),
        getStockMovements(25),
      ]);
      setItems(data);
      setSpaces(listaEspacos);
      setStockMovements(historico);
    } catch (error) {
      console.error('Erro ao listar inventário:', error);
    } finally {
      setACarregar(false);
    }
  }, []);

  const handleExportarRelatorioCsv = useCallback(async () => {
    if (aExportar) return;
    setAExportar(true);
    try {
      await generateAndShareInventoryCSV(items, spaces);
    } catch (error) {
      console.error('Erro ao exportar relatório CSV:', error);
      Alert.alert(
        'Erro na exportação',
        'Não foi possível gerar ou compartilhar o relatório CSV.'
      );
    } finally {
      setAExportar(false);
    }
  }, [aExportar, items, spaces]);

  const handleExportarMovimentacoesCsv = useCallback(async () => {
    if (aExportarAuditoria || stockMovements.length === 0) return;
    setAExportarAuditoria(true);
    try {
      await generateAndShareMovementsCSV(stockMovements);
    } catch (error) {
      console.error('Erro ao exportar auditoria CSV:', error);
      Alert.alert(
        'Erro na exportação',
        'Não foi possível exportar o histórico de movimentações.'
      );
    } finally {
      setAExportarAuditoria(false);
    }
  }, [aExportarAuditoria, stockMovements]);

  const handleExportarPrevisaoCsv = useCallback(
    async (forecastList) => {
      if (aExportarPrevisao) return;
      setAExportarPrevisao(true);
      try {
        await generateAndSharePurchasingForecastCSV(forecastList, spaces);
      } catch (error) {
        console.error('Erro ao exportar previsão de compras:', error);
        Alert.alert(
          'Erro na exportação',
          'Não foi possível exportar o relatório de compras.'
        );
      } finally {
        setAExportarPrevisao(false);
      }
    },
    [aExportarPrevisao, spaces]
  );

  const handleExportarBackupJson = useCallback(async () => {
    if (aExportarBackup) return;
    setAExportarBackup(true);
    try {
      await exportSignedBackupFile({
        spaces,
        items,
        movements: stockMovements,
      });
    } catch (error) {
      console.error('Erro ao exportar backup assinado:', error);
      Alert.alert(
        'Erro no backup',
        'Não foi possível gerar ou compartilhar o arquivo de backup.'
      );
    } finally {
      setAExportarBackup(false);
    }
  }, [aExportarBackup, items, spaces, stockMovements]);

  const handleRestaurarBackupJson = useCallback(
    async (jsonString) => {
      if (aRestaurarBackup) return false;
      const verificacao = parseAndVerifyBackupSnapshot(jsonString);
      if (!verificacao.valid) {
        const msg =
          verificacao.reason === 'checksum_mismatch'
            ? 'Assinatura de integridade (checksum) inválida. O arquivo foi alterado ou corrompido.'
            : 'O conteúdo JSON informado não é um backup válido do Armário Digital.';
        Alert.alert('Backup rejeitado por segurança', msg);
        return false;
      }

      setARestaurarBackup(true);
      try {
        const stats = await restoreDatabaseSnapshot(verificacao.data);
        Keyboard.dismiss();
        await carregarItens(searchQuery);
        Alert.alert(
          'Backup restaurado com sucesso',
          `${stats.restoredItems} produto(s) e ${stats.restoredSpaces} espaço(s) sincronizados com integridade verificada.`
        );
        return true;
      } catch (error) {
        console.error('Erro ao restaurar backup JSON:', error);
        Alert.alert('Erro', 'Não foi possível restaurar o backup informado.');
        return false;
      } finally {
        setARestaurarBackup(false);
      }
    },
    [aRestaurarBackup, carregarItens, searchQuery]
  );

  const handleIniciarEdicaoItem = useCallback((item) => {
    setEditingItemId(item.id);
    setEditingItemName(String(item.name ?? ''));
    setEditingItemMinQty(String(item.min_quantity ?? 3));
    setEditingItemSpaceId(item.space_id ?? null);
    setEditingItemImageUri(item.image_uri ?? null);
    setEditingItemVisualSig(undefined);
    setInventoryCameraOpen(false);
  }, []);

  const handleCancelarEdicaoItem = useCallback(() => {
    setEditingItemId(null);
    setEditingItemName('');
    setEditingItemMinQty('3');
    setEditingItemSpaceId(null);
    setEditingItemImageUri(null);
    setEditingItemVisualSig(undefined);
    setInventoryCameraOpen(false);
  }, []);

  const handleAbrirCameraItem = useCallback(async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res?.granted) return;
    }
    setInventoryCameraOpen((prev) => !prev);
  }, [permission, requestPermission]);

  const handleCapturarFotoItem = useCallback(async () => {
    if (aCapturarFotoItem || !inventoryCameraRef.current?.takePictureAsync) {
      return;
    }
    setACapturarFotoItem(true);
    try {
      const foto = await inventoryCameraRef.current.takePictureAsync({
        quality: 0.65,
        base64: true,
      });
      if (foto?.uri) {
        setEditingItemImageUri(foto.uri);
        if (foto.base64) {
          setEditingItemVisualSig(
            computeVisualSignature({ base64: foto.base64 })
          );
        }
        setInventoryCameraOpen(false);
        Vibration.vibrate(80);
      }
    } catch (error) {
      console.error('Erro ao fotografar item no inventário:', error);
      Alert.alert('Erro na câmera', 'Não foi possível capturar a foto.');
    } finally {
      setACapturarFotoItem(false);
    }
  }, [aCapturarFotoItem]);

  const handleSalvarEdicaoItem = useCallback(
    async (item) => {
      const nomeLimpo = sanitizeTextInput(editingItemName);
      if (!nomeLimpo || aSalvarEdicaoItem) return;
      const minQtyValidado = sanitizeQuantityInput(editingItemMinQty, 3, 99999);

      setASalvarEdicaoItem(true);
      try {
        await updateItemDetails(item.id, {
          name: nomeLimpo,
          space_id: editingItemSpaceId,
          image_uri: editingItemImageUri,
          min_quantity: minQtyValidado,
          visual_signature: editingItemVisualSig,
        });
        setFailedImageIds((prev) => {
          if (!prev[item.id]) return prev;
          const copia = { ...prev };
          delete copia[item.id];
          return copia;
        });
        setEditingItemId(null);
        setInventoryCameraOpen(false);
        Keyboard.dismiss();
        await carregarItens(searchQuery);
      } catch (error) {
        console.error('Erro ao atualizar item:', error);
        Alert.alert('Erro', 'Não foi possível salvar as alterações do item.');
      } finally {
        setASalvarEdicaoItem(false);
      }
    },
    [
      aSalvarEdicaoItem,
      carregarItens,
      editingItemImageUri,
      editingItemMinQty,
      editingItemName,
      editingItemSpaceId,
      editingItemVisualSig,
      searchQuery,
    ]
  );

  const handleImportarLoteCsv = useCallback(
    async (rawTextParam) => {
      const texto = String(rawTextParam ?? csvImportText).trim();
      if (!texto || aImportarCsv) return false;

      const validacao = validateCsvPayloadSize(texto);
      if (!validacao.valid) {
        Alert.alert(
          'Lote CSV excede o limite de segurança',
          'Por segurança, envie lotes de até 512 KB ou 2.500 linhas por vez.'
        );
        return false;
      }

      setAImportarCsv(true);
      try {
        const stats = await importInventoryFromCsvText(
          texto,
          bulkUpsertItemsFromCatalog
        );
        if (stats.totalProcessed === 0) {
          Alert.alert(
            'Nenhuma linha válida',
            'Informe linhas no formato: Código de Barras;Nome do Produto;Quantidade;Espaço'
          );
          return false;
        }

        setCsvImportText('');
        setShowCsvImportPanel(false);
        Keyboard.dismiss();
        await carregarItens(searchQuery);

        Alert.alert(
          'Lote CSV processado',
          `${stats.totalProcessed} registro(s) processado(s): ${stats.insertedCount} novo(s), ${stats.updatedCount} atualizado(s) e ${stats.createdSpacesCount} espaço(s) criado(s).`
        );
        return true;
      } catch (error) {
        console.error('Erro ao importar lote CSV:', error);
        Alert.alert(
          'Erro na importação',
          'Não foi possível processar o lote CSV informado.'
        );
        return false;
      } finally {
        setAImportarCsv(false);
      }
    },
    [aImportarCsv, carregarItens, csvImportText, searchQuery]
  );

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
      const historico = await getStockMovements(25);
      setStockMovements(historico);
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
      const historico = await getStockMovements(25);
      setStockMovements(historico);
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

  const lowStockCount = items.reduce((acc, item) => {
    const qtd = Number(item.quantity ?? 1);
    const minQty = Math.max(0, Number(item.min_quantity ?? 3));
    return qtd > 0 && qtd <= minQty ? acc + 1 : acc;
  }, 0);

  const outOfStockCount = items.reduce((acc, item) => {
    const qtd = Number(item.quantity ?? 1);
    return qtd === 0 ? acc + 1 : acc;
  }, 0);

  const displayedItems = items.filter((item) => {
    const qtd = Number(item.quantity ?? 1);
    const minQty = Math.max(0, Number(item.min_quantity ?? 3));
    if (stockFilter === 'low') return qtd > 0 && qtd <= minQty;
    if (stockFilter === 'out') return qtd === 0;
    return true;
  });

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 76}
    >
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
            placeholder={
              isHome
                ? 'Pesquisar item ou cômodo...'
                : 'Pesquisar por produto, código EAN ou local...'
            }
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

        {/* Pílulas de Auditoria Rápida de Estoque (Todos / Baixo Estoque / Ruptura) */}
        <View style={styles.stockFilterRow}>
          <TouchableOpacity
            style={[
              styles.stockFilterPill,
              stockFilter === 'all' && styles.stockFilterPillActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setStockFilter('all')}
          >
            <Text
              style={[
                styles.stockFilterPillText,
                stockFilter === 'all' && styles.stockFilterPillTextActive,
              ]}
            >
              Todos ({items.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.stockFilterPill,
              stockFilter === 'low' && styles.stockFilterPillWarningActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setStockFilter('low')}
          >
            <Text
              style={[
                styles.stockFilterPillText,
                stockFilter === 'low' && styles.stockFilterPillWarningText,
              ]}
            >
              Baixo ≤ 3 ({lowStockCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.stockFilterPill,
              stockFilter === 'out' && styles.stockFilterPillWarningActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setStockFilter('out')}
          >
            <Text
              style={[
                styles.stockFilterPillText,
                stockFilter === 'out' && styles.stockFilterPillWarningText,
              ]}
            >
              Ruptura ({outOfStockCount})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={displayedItems}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={() => carregarItens(searchQuery)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        ListHeaderComponent={
          !isHome ? (
            <View>
              <B2BStockHealthBanner
                items={items}
                spaces={spaces}
                activeFilter={stockFilter}
                onSelectFilter={setStockFilter}
              />

              <ForecastPurchasingCard
                items={items}
                movements={stockMovements}
                spaces={spaces}
                exporting={aExportarPrevisao}
                onExportForecast={handleExportarPrevisaoCsv}
              />

              <ExportButton
                items={items}
                spaces={spaces}
                itemCount={items.length}
                totalUnits={totalUnidades}
                loading={aExportar}
                onPress={handleExportarRelatorioCsv}
              />

              <B2BBackupRestoreCard
                spacesCount={spaces.length}
                itemsCount={items.length}
                exporting={aExportarBackup}
                restoring={aRestaurarBackup}
                onExportBackup={handleExportarBackupJson}
                onRestoreBackupJson={handleRestaurarBackupJson}
              />

              {/* Painel de Importação em Lote CSV (Interoperabilidade B2B / ERP) */}
              <CsvBulkImportCard
                importing={aImportarCsv}
                onImportCsv={handleImportarLoteCsv}
              />

              {/* Painel Auditável de Movimentações de Estoque (Audit Log B2B — showAuditLogPanel) */}
              <AuditHistoryCard
                stockMovements={stockMovements}
                exporting={aExportarAuditoria}
                onExportMovements={handleExportarMovimentacoesCsv}
                formatarData={formatarData}
              />
            </View>
          ) : null
        }
        contentContainerStyle={
          displayedItems.length === 0
            ? styles.emptyContainer
            : [
                styles.listContent,
                keyboardVisible && styles.scrollContentKeyboardActive,
              ]
        }
        renderItem={({ item }) => {
          const qtd = Number(item.quantity ?? 1);
          const nomeLocal = item.space_name || 'Sem local definido';
          const semEstoque = qtd === 0;
          const imagemFalhou = Boolean(failedImageIds[item.id]);

          return (
            <View style={styles.inventoryCard}>
              <View style={styles.inventoryCardBody}>
                {/* Linha Superior: Miniatura Estúdio sem corte (toque amplia) + Identificação + Metadados + Pílula de Quantidade */}
                <View style={styles.inventoryCardTopRow}>
                  {item.image_uri ? (
                    imagemFalhou ? (
                      <View style={styles.itemThumbFallback}>
                        <CameraOff
                          size={20}
                          color={TOKENS.faint}
                          strokeWidth={1.5}
                        />
                      </View>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() =>
                          openLightbox?.(item.image_uri, item.name)
                        }
                      >
                        <Image
                          source={{ uri: item.image_uri }}
                          style={styles.itemThumbImage}
                          resizeMode="contain"
                          onError={() => handleImageError(item.id)}
                        />
                      </TouchableOpacity>
                    )
                  ) : (
                    <View style={styles.itemThumbFallback}>
                      <Package
                        size={20}
                        color={TOKENS.faint}
                        strokeWidth={1.5}
                      />
                    </View>
                  )}

                  <View style={styles.itemInfo}>
                    <Text style={styles.cardTitleText} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <View style={styles.metaPillsRow}>
                      <TouchableOpacity
                        style={styles.locationPill}
                        activeOpacity={0.75}
                        onPress={() =>
                          editingItemId === item.id
                            ? handleCancelarEdicaoItem()
                            : handleIniciarEdicaoItem(item)
                        }
                      >
                        <MapPin
                          size={12}
                          color={TOKENS.muted}
                          strokeWidth={1.5}
                        />
                        <Text style={styles.locationPillText} numberOfLines={1}>
                          {nomeLocal}
                        </Text>
                        <ChevronRight
                          size={12}
                          color={TOKENS.faint}
                          strokeWidth={1.5}
                        />
                      </TouchableOpacity>

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

                {/* Editor Inline Rápido: Renomear Produto, Fotografar ou Transferir de Setor/Galpão */}
                {editingItemId === item.id && (
                  <View style={styles.inlineEditItemPanel}>
                    <View style={styles.spaceFormHeaderRow}>
                      <Text style={styles.inlineEditLabel}>
                        Editar produto, foto ou local
                      </Text>

                      <TouchableOpacity
                        style={styles.businessCameraPill}
                        activeOpacity={0.82}
                        onPress={handleAbrirCameraItem}
                      >
                        <View style={styles.buttonContentRow}>
                          <Camera
                            size={13}
                            color={TOKENS.text}
                            strokeWidth={1.5}
                          />
                          <Text style={styles.businessCameraPillText}>
                            {inventoryCameraOpen
                              ? 'Fechar câmera'
                              : editingItemImageUri
                                ? 'Trocar foto'
                                : 'Fotografar'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>

                    {inventoryCameraOpen && isFocused && permission?.granted && (
                      <View style={styles.spaceCameraSection}>
                        <View style={styles.spaceCameraBox}>
                          <CameraView
                            ref={inventoryCameraRef}
                            style={styles.spaceCameraPreview}
                            facing="back"
                          />
                          <View
                            style={styles.opticalReticleLayer}
                            pointerEvents="none"
                          >
                            <View
                              style={[
                                styles.opticalCorner,
                                styles.opticalCornerTL,
                              ]}
                            />
                            <View
                              style={[
                                styles.opticalCorner,
                                styles.opticalCornerTR,
                              ]}
                            />
                            <View
                              style={[
                                styles.opticalCorner,
                                styles.opticalCornerBL,
                              ]}
                            />
                            <View
                              style={[
                                styles.opticalCorner,
                                styles.opticalCornerBR,
                              ]}
                            />
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[
                            styles.shutterDockPrimaryButton,
                            aCapturarFotoItem && styles.controlDisabled,
                          ]}
                          activeOpacity={0.85}
                          onPress={handleCapturarFotoItem}
                          disabled={aCapturarFotoItem}
                        >
                          <View style={styles.shutterEmblemOuter}>
                            <View style={styles.shutterEmblemInner}>
                              {aCapturarFotoItem ? (
                                <ActivityIndicator
                                  size="small"
                                  color={TOKENS.ground}
                                />
                              ) : (
                                <Camera
                                  size={16}
                                  color={TOKENS.ground}
                                  strokeWidth={2}
                                />
                              )}
                            </View>
                          </View>
                          <View style={styles.shutterDockTextCol}>
                            <Text style={styles.shutterDockTitle}>
                              {aCapturarFotoItem
                                ? 'Capturando foto...'
                                : 'Tirar Foto do Produto'}
                            </Text>
                            <Text style={styles.shutterDockSubtitle}>
                              Toque aqui para fotografar o produto
                            </Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    )}

                    {editingItemImageUri && (
                      <View style={styles.capturedPreviewContainer}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            openLightbox?.(
                              editingItemImageUri,
                              editingItemName || item.name
                            )
                          }
                        >
                          <Image
                            source={{ uri: editingItemImageUri }}
                            style={styles.capturedPreviewThumb}
                            resizeMode="contain"
                          />
                        </TouchableOpacity>
                        <View style={styles.capturedPreviewTextCol}>
                          <Text
                            style={styles.capturedPreviewTitle}
                            numberOfLines={1}
                          >
                            Fotografia vinculada (toque para ampliar)
                          </Text>
                          <Text
                            style={styles.capturedPreviewSubtitle}
                            numberOfLines={1}
                          >
                            Enquadramento integral sem corte
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.capturedPreviewRemoveBtn}
                          onPress={() => setEditingItemImageUri(null)}
                        >
                          <X size={16} color={TOKENS.muted} strokeWidth={1.5} />
                        </TouchableOpacity>
                      </View>
                    )}

                    <TextInput
                      style={styles.input}
                      value={editingItemName}
                      onChangeText={setEditingItemName}
                      placeholder="Nome do item"
                      placeholderTextColor={TOKENS.faint}
                    />

                    {!isHome && (
                      <View style={styles.minQtyEditRow}>
                        <Text style={styles.inlineEditLabel}>
                          Estoque mínimo de alerta (un.):
                        </Text>
                        <TextInput
                          style={[styles.input, styles.minQtyEditInput]}
                          value={editingItemMinQty}
                          onChangeText={(txt) =>
                            setEditingItemMinQty(txt.replace(/[^0-9]/g, ''))
                          }
                          placeholder="3"
                          placeholderTextColor={TOKENS.faint}
                          keyboardType="numeric"
                          maxLength={5}
                        />
                      </View>
                    )}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipsList}
                    >
                      <TouchableOpacity
                        style={[
                          styles.chip,
                          editingItemSpaceId === null && styles.chipActive,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => setEditingItemSpaceId(null)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            editingItemSpaceId === null &&
                              styles.chipTextActive,
                          ]}
                        >
                          Sem local
                        </Text>
                      </TouchableOpacity>

                      {spaces.map((sp) => {
                        const ativo = editingItemSpaceId === sp.id;
                        return (
                          <TouchableOpacity
                            key={String(sp.id)}
                            style={[styles.chip, ativo && styles.chipActive]}
                            activeOpacity={0.8}
                            onPress={() => setEditingItemSpaceId(sp.id)}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                ativo && styles.chipTextActive,
                              ]}
                            >
                              {sp.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    <View style={styles.inlineEditActionsRow}>
                      <TouchableOpacity
                        style={styles.actionPillButton}
                        activeOpacity={0.8}
                        onPress={handleCancelarEdicaoItem}
                      >
                        <X size={14} color={TOKENS.text} strokeWidth={1.5} />
                        <Text style={styles.actionPillText}>Cancelar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.actionPillButtonPrimary,
                          (!editingItemName.trim() || aSalvarEdicaoItem) &&
                            styles.controlDisabled,
                        ]}
                        activeOpacity={0.85}
                        onPress={() => handleSalvarEdicaoItem(item)}
                        disabled={!editingItemName.trim() || aSalvarEdicaoItem}
                      >
                        <Check
                          size={14}
                          color={TOKENS.ground}
                          strokeWidth={2}
                        />
                        <Text style={styles.actionPillTextPrimary}>
                          {aSalvarEdicaoItem ? 'Salvando...' : 'Salvar e Mover'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

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
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   APP PRINCIPAL (Onboarding Inicial + Tab.Navigator Multi-Perfil)
   ========================================================== */
export default function App() {
  const [userProfile, setUserProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [lightboxImage, setLightboxImage] = useState(null);

  const handleInventoryUpdated = useCallback(() => {
    setInventoryRefreshKey((prev) => prev + 1);
  }, []);

  const openLightbox = useCallback((uri, title = '') => {
    if (uri) {
      setLightboxImage({ uri, title });
    }
  }, []);

  const closeLightbox = useCallback(() => {
    setLightboxImage(null);
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
        // Backfill assíncrono em background após liberar a UI inicial (evita travar troca de abas)
        setTimeout(() => {
          backfillVisualSignatures(computeVisualSignature).catch(() => {});
        }, 400);
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
      value={{ userProfile, selectProfile, resetProfile, openLightbox }}
    >
      <NavigationContainer theme={TEMA}>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            lazy: true,
            freezeOnBlur: true,
            headerStyle: {
              backgroundColor: '#09090b',
              elevation: 0,
              shadowOpacity: 0,
              borderBottomWidth: 1,
              borderBottomColor: '#27272a',
            },
            headerTintColor: TOKENS.text,
            headerTitleStyle: {
              fontSize: TOKENS.fsTitle,
              fontWeight: '700',
              letterSpacing: -0.3,
              color: TOKENS.text,
            },
            headerRight: () => (
              <TouchableOpacity
                style={styles.headerProfileSwitch}
                activeOpacity={0.78}
                onPress={resetProfile}
              >
                {isHome ? (
                  <Home size={13} color={TOKENS.accent} strokeWidth={1.75} />
                ) : (
                  <Building2 size={13} color={TOKENS.accent} strokeWidth={1.75} />
                )}
                <Text style={styles.headerProfileSwitchText}>
                  {isHome ? 'Casa' : 'Negócio'}
                </Text>
                <RefreshCw size={11} color={TOKENS.muted} strokeWidth={1.5} />
              </TouchableOpacity>
            ),
            // Estética shadcn/ui + 21st.dev Magic Dark: aba ativa em verde-neon #c6f24e
            tabBarActiveTintColor: TOKENS.accent,
            tabBarInactiveTintColor: TOKENS.muted,
            tabBarLabelStyle: {
              fontSize: 11,
              fontWeight: '600',
              letterSpacing: 0.1,
            },
            tabBarStyle: {
              backgroundColor: '#09090b',
              borderTopWidth: 1,
              borderTopColor: '#27272a',
              height: 60,
              paddingTop: 6,
              paddingBottom: 8,
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

      {/* Lightbox Modal modularizado e memoizado para inspeção de fotos sem corte */}
      <PhotoLightboxModal
        lightboxImage={lightboxImage}
        onClose={closeLightbox}
      />
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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

  // Scanner e Câmera (Visor Óptico Limpo + Botão de Captura Embaixo)
  scannerScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  scrollContentKeyboardActive: {
    paddingBottom: 150,
  },
  cameraStageCard: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: TOKENS.surface,
    padding: 12,
    gap: 10,
  },
  cameraContainer: {
    height: 224,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  activeCameraWrapper: {
    flex: 1,
    position: 'relative',
  },
  cameraShutterDock: {
    width: '100%',
  },
  shutterDockPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: TOKENS.raised,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#383838',
  },
  shutterEmblemOuter: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#ffffff',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterEmblemInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDockTextCol: {
    flex: 1,
    gap: 2,
  },
  shutterDockTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '700',
  },
  shutterDockSubtitle: {
    color: TOKENS.muted,
    fontSize: 12,
  },
  capturedDockActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  capturedDockSecondaryBtn: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: TOKENS.raised,
  },
  capturedDockSecondaryBtnText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  capturedDockPrimaryBtn: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 14,
    backgroundColor: TOKENS.text,
  },
  capturedDockPrimaryBtnText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsSmall,
    fontWeight: '700',
  },
  opticalReticleLayer: {
    position: 'absolute',
    top: 14,
    right: 14,
    bottom: 14,
    left: 14,
  },
  opticalCorner: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: 'rgba(255, 255, 255, 0.42)',
  },
  opticalCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 6,
  },
  opticalCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 6,
  },
  opticalCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 6,
  },
  opticalCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: 6,
  },
  capturedStageWrapper: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    position: 'relative',
  },
  capturedStageTouch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  capturedStageImage: {
    width: '100%',
    height: '100%',
  },
  capturedStageTopBar: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  capturedStageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.pillPositiveBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radiusControl,
  },
  capturedStageBadgeText: {
    color: TOKENS.pillPositiveInk,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  retakeStagePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: TOKENS.radiusControl,
  },
  retakeStagePillText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  yoloEngineStatusPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: TOKENS.radiusControl,
  },
  yoloEngineStatusPillReady: {
    backgroundColor: TOKENS.pillPositiveBg,
  },
  yoloEngineStatusText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  yoloEngineStatusTextReady: {
    color: TOKENS.pillPositiveInk,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    marginHorizontal: 14,
    borderRadius: 16,
    padding: TOKENS.pad,
    backgroundColor: TOKENS.surface,
  },
  stepHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    marginTop: 4,
  },
  stepNumberBadge: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberBadgeText: {
    color: TOKENS.accent,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  stepHeaderTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    flex: 1,
  },
  homeCaptureSection: {
    marginBottom: 4,
  },
  capturePhotoHeroButton: {
    backgroundColor: TOKENS.text,
    minHeight: 46,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: TOKENS.gap,
  },
  capturePhotoHeroButtonText: {
    color: TOKENS.ground,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  businessTopCaptureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: TOKENS.gap,
  },
  businessCaptureFullButton: {
    flex: 1,
  },
  scannedBarcodeBanner: {
    borderWidth: 1,
    borderColor: TOKENS.borderPositive,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.pillPositiveBg,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: TOKENS.gap,
  },
  scannedBarcodeTextCol: {
    flex: 1,
    gap: 2,
  },
  scannedBarcodeSubtext: {
    color: TOKENS.muted,
    fontSize: 12,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.raised,
    borderRadius: 14,
    padding: 10,
    marginBottom: TOKENS.gap,
    gap: 12,
  },
  capturedPreviewThumb: {
    width: 60,
    height: 60,
    borderRadius: 14,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
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
  },
  qtyStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  qtyStepButton: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepButtonPrimary: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: TOKENS.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyStepperInput: {
    flex: 1,
    marginBottom: 0,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.input,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderBottomColor: TOKENS.border,
    gap: TOKENS.gap,
  },
  secondaryPillButton: {
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    marginTop: TOKENS.gap,
    padding: TOKENS.pad,
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
  },
  spaceFormHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  spaceFormLabelFlex: {
    flex: 1,
    marginBottom: 0,
  },
  spaceCameraSection: {
    marginVertical: 10,
    gap: 10,
  },
  spaceCameraBox: {
    height: 210,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    position: 'relative',
  },
  spaceCameraPreview: {
    flex: 1,
  },
  spaceCameraActionsBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: 'center',
  },
  spaceFormButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spaceSubmitButtonFlex: {
    flex: 1,
  },
  sectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 18,
    paddingBottom: 10,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    marginBottom: TOKENS.gap,
    overflow: 'hidden',
  },
  spaceThumbImage: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
  },
  spaceThumbFallback: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  spaceSavedItemsSection: {
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
    gap: 10,
  },
  spaceSavedItemsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  spaceSavedItemsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spaceSavedItemsEmptyCard: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 6,
  },
  spaceSavedItemsEmptyText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
    textAlign: 'center',
  },
  spaceSavedItemsEmptySubtext: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    textAlign: 'center',
    lineHeight: 18,
  },
  spaceSavedItemCard: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  spaceSavedItemThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
  },
  spaceSavedItemThumbFallback: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: TOKENS.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spaceSavedItemInfoCol: {
    flex: 1,
    gap: 4,
  },
  spaceSavedItemTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  spacePhotoActionPill: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: TOKENS.raised,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: TOKENS.radiusControl,
  },
  spacePhotoActionText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    paddingVertical: 16,
  },
  kpiCell: {
    flex: 1,
    paddingHorizontal: TOKENS.pad,
  },
  kpiDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: TOKENS.input,
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
  stockFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  stockFilterPill: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: TOKENS.radiusControl,
  },
  stockFilterPillActive: {
    backgroundColor: TOKENS.text,
  },
  stockFilterPillWarningActive: {
    borderWidth: 1,
    borderColor: '#4a3810',
    backgroundColor: TOKENS.pillWarningBg,
  },
  stockFilterPillText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  stockFilterPillTextActive: {
    color: TOKENS.ground,
  },
  stockFilterPillWarningText: {
    color: TOKENS.pillWarningInk,
  },
  csvImportCard: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: TOKENS.gap,
  },
  csvImportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  csvImportTitleBlock: {
    flex: 1,
    gap: 2,
  },
  csvImportTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsBody,
    fontWeight: '600',
  },
  csvImportSubtitle: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
  },
  csvImportTogglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: TOKENS.radiusControl,
  },
  csvImportTogglePillActive: {
    backgroundColor: TOKENS.text,
  },
  csvImportToggleText: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  csvImportToggleTextActive: {
    color: TOKENS.ground,
  },
  csvImportBody: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
    gap: 10,
  },
  csvImportHint: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  csvImportInput: {
    backgroundColor: TOKENS.raised,
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  auditLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border,
  },
  auditLogLeftCol: {
    flex: 1,
    gap: 2,
  },
  auditLogItemName: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  auditLogMetaText: {
    color: TOKENS.faint,
    fontSize: TOKENS.fsSmall,
    fontVariant: ['tabular-nums'],
  },
  auditDeltaPill: {
    minWidth: 48,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: TOKENS.radiusControl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  auditDeltaText: {
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Listas e Cards do Inventário ('true-black-flat': surface #111111, radius 20, sem borda, sem sombra)
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
  },
  listContentWithKeyboard: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 150,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: TOKENS.pad,
  },
  inventoryCard: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: TOKENS.surface,
    borderRadius: 16,
    marginBottom: TOKENS.gap,
    overflow: 'hidden',
  },
  inventoryCardBody: {
    padding: TOKENS.pad,
  },
  itemThumbImage: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
  },
  itemThumbFallback: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    width: 64,
    height: 64,
    borderRadius: 16,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: TOKENS.borderPositive,
    backgroundColor: TOKENS.pillPositiveBg,
  },
  quantityPillWarning: {
    borderWidth: 1,
    borderColor: '#4a3810',
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
  inlineEditItemPanel: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
    gap: 8,
  },
  inlineEditLabel: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '600',
  },
  inlineIconButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chipsList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  chip: {
    borderWidth: 1,
    borderColor: TOKENS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TOKENS.raised,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: TOKENS.radiusControl,
  },
  chipActive: {
    backgroundColor: TOKENS.text,
  },
  chipText: {
    color: TOKENS.muted,
    fontSize: TOKENS.fsSmall,
    fontWeight: '500',
  },
  chipTextActive: {
    color: TOKENS.ground,
    fontWeight: '600',
  },
  inlineEditActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 4,
  },

  // Painel de Ações Rápidas (Separado por hairline 1px #161616)
  actionPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: TOKENS.border,
    gap: 8,
  },
  qtyActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionPillButton: {
    borderWidth: 1,
    borderColor: TOKENS.border,
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
    borderWidth: 1,
    borderColor: '#4a1c18',
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

  // Lightbox Modal de Tela Cheia (visualização sem cortes de qualquer foto do inventário/espaços)
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  lightboxTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  lightboxTitle: {
    color: TOKENS.text,
    fontSize: TOKENS.fsSection,
    fontWeight: '600',
    flex: 1,
  },
  lightboxImageWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#0a0a0a',
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
    padding: 12,
  },
  lightboxImage: {
    width: '100%',
    height: '100%',
  },
  minQtyEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  minQtyEditInput: {
    width: 96,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
