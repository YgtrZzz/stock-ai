import { useCallback, useState } from 'react';
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
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { insertItem, getItems } from './database';

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

// Tema escuro do React Navigation alinhado com a paleta da app
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

/* ==========================================================
   SEPARADOR 1: SCANNER (câmara + formulário manual)
   ========================================================== */
function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [nome, setNome] = useState('');
  const [aGuardar, setAGuardar] = useState(false);

  // Só monta a câmara quando o separador está visível (poupa bateria e liberta o sensor)
  const isFocused = useIsFocused();

  const nomeValido = nome.trim().length > 0;

  const handleSalvar = async () => {
    const nomeLimpo = nome.trim();
    if (!nomeLimpo || aGuardar) return;

    setAGuardar(true);
    try {
      await insertItem(nomeLimpo);
      setNome('');
      Keyboard.dismiss();
      Alert.alert('Item salvo', `"${nomeLimpo}" foi adicionado ao inventário.`);
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
      {/* Câmara no topo */}
      <View style={styles.cameraContainer}>{renderCamera()}</View>

      {/* Formulário manual por baixo da câmara */}
      <View style={styles.form}>
        <Text style={styles.label}>Nome do objeto</Text>
        <TextInput
          style={styles.input}
          value={nome}
          onChangeText={setNome}
          placeholder="Ex: Caneca azul"
          placeholderTextColor={CORES.textoSuave}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={handleSalvar}
          editable={!aGuardar}
        />
        <TouchableOpacity
          style={[styles.saveButton, (!nomeValido || aGuardar) && styles.saveButtonDisabled]}
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
   SEPARADOR 2: INVENTÁRIO (listagem)
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

  // Recarrega a lista sempre que o utilizador entra neste separador
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
        contentContainerStyle={itens.length === 0 ? styles.emptyContainer : styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.itemIconBox}>
              <Text style={styles.itemIcon}>📦</Text>
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>
                {item.name}
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
                Vá ao separador "Scanner" para adicionar o primeiro objeto.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

/* ==========================================================
   NAVEGAÇÃO
   ========================================================== */
const tabIcon = (emoji) => ({ focused }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

export default function App() {
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
          tabBarStyle: { backgroundColor: CORES.superficie, borderTopColor: CORES.borda },
        }}
      >
        <Tab.Screen
          name="Scanner"
          component={ScannerScreen}
          options={{ tabBarIcon: tabIcon('📷') }}
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
    padding: 20,
    backgroundColor: CORES.fundo,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
  },
  label: {
    color: CORES.textoSuave,
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    backgroundColor: CORES.superficie2,
    color: CORES.texto,
    fontSize: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CORES.borda,
    marginBottom: 12,
  },
  saveButton: {
    backgroundColor: CORES.primaria,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: CORES.fundo,
    fontSize: 17,
    fontWeight: '700',
  },

  // Inventário
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
  },
  itemName: {
    color: CORES.texto,
    fontSize: 16,
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
