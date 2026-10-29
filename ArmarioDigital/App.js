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
   ABA 1: SCANNER (Câmera + Seletor de Espaço + Formulário)
   ========================================================== */
function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [nome, setNome] = useState('');
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
          // Se ainda não houver espaço selecionado e existir pelo menos um, pré-seleciona o primeiro
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

    setAGuardar(true);
    try {
      await insertItem(nomeLimpo, espacoSelecionadoId);
      const espacoEscolhido = espacos.find((e) => e.id === espacoSelecionadoId);
      const destinoTexto = espacoEscolhido
        ? ` em "${formatarNomeEspaco(espacoEscolhido)}"`
        : '';

      setNome('');
      Keyboard.dismiss();
      Alert.alert(
        'Item salvo',
        `"${nomeLimpo}" foi guardado${destinoTexto} com sucesso.`
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

      {/* Formulário manual e seletor de espaço abaixo da câmera */}
      <View style={styles.form}>
        <Text style={styles.label}>Nome do objeto</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Ex: Furadeira, Caneca azul..."
          placeholderTextColor={CORES.textoSuave}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={handleSalvar}
          editable={!aGuardar}
        />

        {/* Seletor visual de Espaço logo acima do botão Salvar Item */}
        <Text style={styles.label}>Guardar em qual Espaço?</Text>
        {espacos.length === 0 ? (
          <View style={styles.noSpacesBox}>
            <Text style={styles.noSpacesText}>
              Nenhum espaço cadastrado. Crie cômodos na aba "Espaços" (ou salve
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
   ABA 2: ESPAÇOS (Cadastro e Listagem de Cômodos/Subcômodos)
   ========================================================== */
function EspacosScreen() {
  const [espacos, setEspacos] = useState([]);
  const [nomeEspaco, setNomeEspaco] = useState('');
  const [parentId, setParentId] = useState(null);
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

  const nomeValido = nomeEspaco.trim().length > 0;

  const handleAdicionarEspaco = async () => {
    const nomeLimpo = nomeEspaco.trim();
    if (!nomeLimpo || aCriar) return;

    setACriar(true);
    try {
      await addSpace(nomeLimpo, parentId);
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
      {/* Formulário de novo espaço */}
      <View style={styles.spaceFormCard}>
        <Text style={styles.label}>Novo Espaço (Cômodo ou Subcômodo)</Text>
        <TextInput
          style={styles.input}
          value={nomeEspaco}
          onChangeText={setNomeEspaco}
          placeholder="Ex: Estoque Central, Armário 1..."
          placeholderTextColor={CORES.textoSuave}
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={handleAdicionarEspaco}
          editable={!aCriar}
        />

        {/* Seletor opcional de espaço pai para permitir hierarquia */}
        {espacos.length > 0 && (
          <>
            <Text style={styles.label}>
              Dentro de qual espaço? (opcional — hierarquia)
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.selectorRow}
            >
              <TouchableOpacity
                style={[
                  styles.spaceChip,
                  parentId === null && styles.spaceChipActive,
                ]}
                onPress={() => setParentId(null)}
              >
                <Text
                  style={[
                    styles.spaceChipText,
                    parentId === null && styles.spaceChipTextActive,
                  ]}
                >
                  🏠 Espaço Principal (Raiz)
                </Text>
              </TouchableOpacity>

              {espacos.map((esp) => {
                const selecionado = parentId === esp.id;
                return (
                  <TouchableOpacity
                    key={esp.id}
                    style={[
                      styles.spaceChip,
                      selecionado && styles.spaceChipActive,
                    ]}
                    onPress={() => setParentId(esp.id)}
                  >
                    <Text
                      style={[
                        styles.spaceChipText,
                        selecionado && styles.spaceChipTextActive,
                      ]}
                    >
                      ↳ {esp.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

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
            <Text style={styles.saveButtonText}>+ Cadastrar Espaço</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Cabeçalho da lista de espaços */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Espaços cadastrados</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {espacos.length} {espacos.length === 1 ? 'espaço' : 'espaços'}
          </Text>
        </View>
      </View>

      {/* FlatList exibindo os espaços */}
      <FlatList
        data={espacos}
        keyExtractor={(item) => String(item.id)}
        refreshing={aCarregar}
        onRefresh={carregarEspacos}
        contentContainerStyle={
          espacos.length === 0 ? styles.emptyContainer : styles.listContent
        }
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.itemIconBox}>
              <Text style={styles.itemIcon}>
                {item.parent_id ? '📂' : '🏠'}
              </Text>
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {formatarNomeEspaco(item)}
              </Text>
              <Text style={styles.itemDate}>
                {item.parent_name
                  ? `Subcômodo de ${item.parent_name}`
                  : 'Cômodo principal'}
              </Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.item_count ?? 0}{' '}
                {(item.item_count ?? 0) === 1 ? 'item' : 'itens'}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={styles.emptyText}>Nenhum espaço cadastrado.</Text>
              <Text style={styles.emptySubtext}>
                Cadastre ambientes como "Estoque Central" ou "Armário 1" acima.
              </Text>
            </View>
          )
        }
      />
    </KeyboardAvoidingView>
  );
}

/* ==========================================================
   ABA 3: INVENTÁRIO (Listagem dedicada de itens)
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

  return (
    <View style={styles.screen}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Total de itens</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {itens.length} {itens.length === 1 ? 'item' : 'itens'}
          </Text>
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
        renderItem={({ item }) => (
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
          </View>
        )}
        ListEmptyComponent={
          !aCarregar && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyText}>Nenhum item no inventário.</Text>
              <Text style={styles.emptySubtext}>
                Vá à aba "Scanner" para guardar o primeiro objeto em um espaço.
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
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: 'rgba(0, 255, 204, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: CORES.primaria,
    fontSize: 13,
    fontWeight: '700',
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
    marginRight: 8,
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
  },
  emptySubtext: {
    color: '#888888',
    fontSize: 13,
    textAlign: 'center',
  },
});
