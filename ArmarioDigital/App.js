import { useCallback, useEffect, useState } from 'react';
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
  View,
} from 'react-native';
import {
  initDatabase,
  addSpace,
  getSpaces,
  insertItem,
  getItems,
} from './database';

const Tab = createBottomTabNavigator();

const CORES = {
  fundo: '#121212',
  superficie: '#1e1e1e',
  superficie2: '#2a2a2a',
  borda: '#333333',
  texto: '#ffffff',
  textoSuave: '#9e9e9e',
  primaria: '#00ffcc',
};

const TEMA = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: CORES.primaria,
    background: CORES.fundo,
    card: CORES.superficie,
    text: CORES.texto,
    border: CORES.borda,
  },
};

function formatarNomeEspaco(espaco) {
  if (!espaco) return '';
  return espaco.parent_name
    ? `${espaco.parent_name} › ${espaco.name}`
    : espaco.name;
}

/* ==========================================================
   ABA 1: SCANNER (Câmera + Nome/Quantidade + Seletor de Espaço)
   ========================================================== */
function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [nome, setNome] = useState('');
  const [quantidade, setQuantidade] = useState('1');
  const [espacos, setEspacos] = useState([]);
  const [espacoSelecionadoId, setEspacoSelecionadoId] = useState(null);
  const [aGuardar, setAGuardar] = useState(false);

  const isFocused = useIsFocused();

  // Recarrega os espaços disponíveis sempre que o usuário abre a aba Scanner
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

  const nomeValido = nome.trim().length > 0;

  const handleSalvar = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || aGuardar) return;

    const qtdParsed = parseInt(quantidade.replace(/[^0-9]/g, ''), 10);
    const qtdFinal = Number.isFinite(qtdParsed) && qtdParsed > 0 ? qtdParsed : 1;

    setAGuardar(true);
    try {
      await insertItem(nomeLimpo, espacoSelecionadoId, qtdFinal);
      const espacoEscolhido = espacos.find((e) => e.id === espacoSelecionadoId);
      const destinoTexto = espacoEscolhido
        ? ` em "${formatarNomeEspaco(espacoEscolhido)}"`
        : '';

      setNome('');
      setQuantidade('1');
      Keyboard.dismiss();
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
          <ActivityIndicator size="large" color={CORES.primaria} />
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.cameraPlaceholder}>
          <Text style={styles.placeholderIcon}>📷</Text>
          <Text style={styles.placeholderTitle}>Acesso à câmera</Text>
          <Text style={styles.placeholderText}>
            Precisamos da sua permissão para mostrar a câmera.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            activeOpacity={0.8}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Permitir acesso</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return isFocused ? (
      <CameraView style={styles.camera} facing="back" />
    ) : (
      <View style={styles.cameraPlaceholder} />
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Câmera no topo */}
      <View style={styles.cameraContainer}>{renderCamera()}</View>

      {/* Formulário manual: Nome + Quantidade lado a lado e Seletor de Espaço */}
      <View style={styles.form}>
        <View style={styles.inputRow}>
          <View style={styles.nameColumn}>
            <Text style={styles.label}>Nome do objeto</Text>
            <TextInput
              style={styles.input}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex: Caixa de Parafusos"
              placeholderTextColor={CORES.textoSuave}
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
              placeholderTextColor={CORES.textoSuave}
              keyboardType="numeric"
              maxLength={5}
              returnKeyType="done"
              onSubmitEditing={handleSalvar}
              editable={!aGuardar}
            />
          </View>
        </View>

        {/* Seletor visual de Espaço logo acima do botão Salvar Item */}
        <Text style={styles.label}>Guardar em qual Espaço?</Text>
        {espacos.length === 0 ? (
          <View style={styles.noSpacesBox}>
            <Text style={styles.noSpacesText}>
              Nenhum espaço cadastrado. Crie locais na aba "Espaços" (ou salve
              sem espaço).
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
                  <Text
                    style={[
                      styles.spaceChipText,
                      selecionado && styles.spaceChipTextActive,
                    ]}
                  >
                    📍 {formatarNomeEspaco(espaco)}
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
                Sem espaço
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!nomeValido || aGuardar) && styles.saveButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleSalvar}
          disabled={!nomeValido || aGuardar}
        >
          {aGuardar ? (
            <ActivityIndicator color={CORES.fundo} />
          ) : (
            <Text style={styles.saveButtonText}>Salvar Item</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 2: ESPAÇOS (Drill-down Hierárquico com currentParentId)
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

  // Espaço pai atualmente aberto (quando currentParentId !== null)
  const espacoAtual = espacos.find((e) => e.id === currentParentId) || null;

  // Filtra apenas os espaços cujo parent_id seja igual ao currentParentId
  const espacosFiltrados = espacos.filter(
    (e) => (e.parent_id ?? null) === currentParentId
  );

  const nomeValido = nomeEspaco.trim().length > 0;

  // Sobe um nível na árvore hierárquica (ou volta para null na raiz)
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
      {/* Botão '⬅️ Voltar' no topo (renderizado apenas quando currentParentId !== null) */}
      {currentParentId !== null && (
        <View style={styles.drilldownBar}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={handleVoltar}
          >
            <Text style={styles.backButtonText}>⬅️ Voltar</Text>
          </TouchableOpacity>
          <View style={styles.breadcrumbBox}>
            <Text style={styles.breadcrumbLabel}>Dentro de:</Text>
            <Text style={styles.breadcrumbTitle} numberOfLines={1}>
              {espacoAtual ? formatarNomeEspaco(espacoAtual) : 'Sub-espaço'}
            </Text>
          </View>
        </View>
      )}

      {/* Formulário para cadastrar espaço no nível atual */}
      <View style={styles.spaceFormCard}>
        <Text style={styles.label}>
          {currentParentId === null
            ? 'Novo Espaço Principal (ex: Estoque Central)'
            : `Novo Sub-espaço dentro de "${espacoAtual?.name || ''}" (ex: Armário 1)`}
        </Text>
        <TextInput
          style={styles.input}
          value={nomeEspaco}
          onChangeText={setNomeEspaco}
          placeholder={
            currentParentId === null
              ? 'Ex: Estoque Central, Galpão A...'
              : 'Ex: Armário 1, Prateleira B...'
          }
          placeholderTextColor={CORES.textoSuave}
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={handleAdicionarEspaco}
          editable={!aCriar}
        />

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!nomeValido || aCriar) && styles.saveButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={handleAdicionarEspaco}
          disabled={!nomeValido || aCriar}
        >
          {aCriar ? (
            <ActivityIndicator color={CORES.fundo} />
          ) : (
            <Text style={styles.saveButtonText}>
              {currentParentId === null
                ? '+ Cadastrar Espaço'
                : '+ Cadastrar Sub-espaço'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Cabeçalho da lista filtrada */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {currentParentId === null
            ? 'Espaços Principais (Raiz)'
            : `Sub-espaços de ${espacoAtual?.name || ''}`}
        </Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {espacosFiltrados.length}{' '}
            {espacosFiltrados.length === 1 ? 'local' : 'locais'}
          </Text>
        </View>
      </View>

      {/* FlatList exibindo apenas os espaços com parent_id === currentParentId */}
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

          return (
            <TouchableOpacity
              style={styles.itemCard}
              activeOpacity={0.75}
              onPress={() => setCurrentParentId(item.id)}
            >
              <View style={styles.itemIconBox}>
                <Text style={styles.itemIcon}>
                  {item.parent_id ? '📂' : '🏠'}
                </Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemDate}>
                  {qtdSubespacos > 0
                    ? `${qtdSubespacos} ${qtdSubespacos === 1 ? 'sub-espaço' : 'sub-espaços'} • Toque para abrir`
                    : 'Toque para entrar / adicionar sub-espaços'}
                </Text>
              </View>
              <View style={styles.spaceRightBox}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {item.item_count ?? 0}{' '}
                    {(item.item_count ?? 0) === 1 ? 'item' : 'itens'}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>
                {currentParentId === null ? '🏠' : '📂'}
              </Text>
              <Text style={styles.emptyText}>
                {currentParentId === null
                  ? 'Nenhum espaço principal cadastrado.'
                  : 'Nenhum sub-espaço neste local.'}
              </Text>
              <Text style={styles.emptySubtext}>
                {currentParentId === null
                  ? 'Use o formulário acima para criar seu primeiro cômodo ou setor.'
                  : 'Use o formulário acima para adicionar divisões (ex: Armário 1, Gaveta 2) ou toque em "⬅️ Voltar".'}
              </Text>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 3: INVENTÁRIO (Listagem com Badge de Quantidade B2B)
   ========================================================== */
function InventarioScreen() {
  const [itens, setItens] = useState([]);
  const [aCarregar, setACarregar] = useState(false);

  const carregarItens = useCallback(async () => {
    setACarregar(true);
    try {
      const data = await getItems();
      setItens(data);
    } catch (error) {
      console.error('Erro ao listar inventário:', error);
    } finally {
      setACarregar(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      carregarItens();
    }, [carregarItens])
  );

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

  const totalUnidades = itens.reduce(
    (acc, item) => acc + (Number(item.quantity) || 1),
    0
  );

  return (
    <View style={styles.screen}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Total no inventário</Text>
        <View style={styles.headerBadges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {itens.length} {itens.length === 1 ? 'registro' : 'registros'}
            </Text>
          </View>
          <View style={styles.qtyHeaderBadge}>
            <Text style={styles.qtyHeaderBadgeText}>
              {totalUnidades} {totalUnidades === 1 ? 'un.' : 'uns.'}
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        data={itens}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={carregarItens}
        contentContainerStyle={
          itens.length === 0 ? styles.emptyContainer : styles.listContent
        }
        renderItem={({ item }) => {
          const qtd = item.quantity ?? 1;
          return (
            <View style={styles.itemCard}>
              <View style={styles.itemIconBox}>
                <Text style={styles.itemIcon}>📦</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.itemSpaceTag}>
                  📍 {item.space_name ? item.space_name : 'Sem espaço definido'}
                </Text>
                <Text style={styles.itemDate}>
                  #{item.id} • {formatarData(item.created_at)}
                </Text>
              </View>

              {/* Tag / Badge de Quantidade visualmente destacada */}
              <View style={styles.quantityBadge}>
                <Text style={styles.quantityBadgeLabel}>QTD</Text>
                <Text style={styles.quantityBadgeValue}>{qtd}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Nenhum item no inventário.</Text>
              <Text style={styles.emptySubtext}>
                Vá à aba "Scanner" para registrar objetos e suas quantidades.
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
const tabIcon = (emoji) => ({ focused }) => (
  <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

export default function App() {
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
          headerStyle: { backgroundColor: CORES.superficie },
          headerTintColor: CORES.texto,
          headerTitleStyle: { fontWeight: '700' },
          tabBarActiveTintColor: CORES.primaria,
          tabBarInactiveTintColor: CORES.textoSuave,
          tabBarStyle: {
            backgroundColor: CORES.superficie,
            borderTopColor: CORES.borda,
          },
        }}
      >
        <Tab.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ tabBarIcon: tabIcon('📷') }}
        />
        <Tab.Screen
          name="Espaços"
          component={EspacosScreen}
          options={{ tabBarIcon: tabIcon('🏠') }}
        />
        <Tab.Screen
          name="Inventário"
          component={InventarioScreen}
          options={{ tabBarIcon: tabIcon('🗄️') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CORES.fundo,
  },

  // Scanner
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  cameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: CORES.superficie,
  },
  placeholderIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  placeholderTitle: {
    color: CORES.texto,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  placeholderText: {
    color: CORES.textoSuave,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  permissionButton: {
    backgroundColor: CORES.primaria,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  permissionButtonText: {
    color: CORES.fundo,
    fontSize: 15,
    fontWeight: '700',
  },
  form: {
    padding: 18,
    backgroundColor: CORES.fundo,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  nameColumn: {
    flex: 1,
  },
  qtyColumn: {
    width: 105,
  },
  qtyInput: {
    textAlign: 'center',
    fontWeight: '700',
  },

  // Drill-down de Espaços
  drilldownBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CORES.superficie2,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
    gap: 12,
  },
  backButton: {
    backgroundColor: CORES.superficie,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CORES.primaria,
  },
  backButtonText: {
    color: CORES.primaria,
    fontSize: 14,
    fontWeight: '700',
  },
  breadcrumbBox: {
    flex: 1,
  },
  breadcrumbLabel: {
    color: CORES.textoSuave,
    fontSize: 11,
  },
  breadcrumbTitle: {
    color: CORES.texto,
    fontSize: 15,
    fontWeight: '700',
  },
  spaceFormCard: {
    padding: 18,
    backgroundColor: CORES.superficie,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  label: {
    color: CORES.textoSuave,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: CORES.superficie2,
    color: CORES.texto,
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginBottom: 12,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 14,
  },
  spaceChip: {
    backgroundColor: CORES.superficie2,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginRight: 8,
  },
  spaceChipActive: {
    backgroundColor: 'rgba(0, 255, 204, 0.16)',
    borderColor: CORES.primaria,
  },
  spaceChipText: {
    color: CORES.textoSuave,
    fontSize: 13,
    fontWeight: '600',
  },
  spaceChipTextActive: {
    color: CORES.primaria,
    fontWeight: '700',
  },
  noSpacesBox: {
    backgroundColor: CORES.superficie,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CORES.borda,
  },
  noSpacesText: {
    color: CORES.textoSuave,
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: CORES.primaria,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: CORES.fundo,
    fontSize: 16,
    fontWeight: '700',
  },

  // Listas (Espaços e Inventário)
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: CORES.superficie,
    borderBottomWidth: 1,
    borderBottomColor: CORES.borda,
  },
  listTitle: {
    color: CORES.texto,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: CORES.primaria,
    fontSize: 12,
    fontWeight: '700',
  },
  qtyHeaderBadge: {
    backgroundColor: CORES.primaria,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  qtyHeaderBadgeText: {
    color: CORES.fundo,
    fontSize: 12,
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CORES.superficie,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    marginBottom: 10,
  },
  itemIconBox: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: CORES.superficie2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemIcon: {
    fontSize: 20,
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemName: {
    color: CORES.texto,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSpaceTag: {
    color: CORES.primaria,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemDate: {
    color: CORES.textoSuave,
    fontSize: 12,
  },
  spaceRightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chevron: {
    color: CORES.textoSuave,
    fontSize: 22,
    fontWeight: '600',
  },

  // Badge de quantidade destacada no card do Inventário
  quantityBadge: {
    minWidth: 54,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 255, 204, 0.14)',
    borderWidth: 1,
    borderColor: CORES.primaria,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityBadgeLabel: {
    color: CORES.primaria,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  quantityBadgeValue: {
    color: CORES.texto,
    fontSize: 16,
    fontWeight: '800',
  },

  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyText: {
    color: '#e0e0e0',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptySubtext: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
  },
});
