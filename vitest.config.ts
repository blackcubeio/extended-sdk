import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests d'intégration partagent les mêmes comptes testnet réels :
    // exécution séquentielle pour éviter que les read-back de solde/état/ordres
    // soient faussés par des opérations concurrentes.
    fileParallelism: false,
  },
});
