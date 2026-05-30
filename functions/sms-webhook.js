const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { sender, text } = JSON.parse(event.body);

    // 🔍 Détection Orange Money
    const montantMatch = text.match(/reçu (\d+) FCFA/);
    const expediteurMatch = text.match(/de (\+226\d+)/);

    if (!montantMatch || !expediteurMatch) {
      return { statusCode: 200, body: 'SMS non reconnu' };
    }

    const montant = parseInt(montantMatch[1]);
    const numero = expediteurMatch[1];

    // 👤 Chercher l'utilisateur par son téléphone
    const { data: user } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', numero)
      .single();

    if (!user) {
      return { statusCode: 200, body: 'Utilisateur non trouvé' };
    }

    // 💰 Créditer le compte
    await supabase.rpc('credit_balance', {
      user_id: user.id,
      amount: montant
    });

    // 📦 Journaliser la transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      amount: montant,
      transaction_id: `SMS_${Date.now()}`,
      status: 'confirmed'
    });

    console.log(`✅ ${montant} FCFA crédités à ${numero}`);

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};
