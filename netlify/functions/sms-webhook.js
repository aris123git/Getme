const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function parseSmsAmountAndPhone(text) {
    if (!text) return null;
    const amountMatch =
        text.match(/reçu\s+([\d\s]+)\s*F\s*CFA/i) ||
        text.match(/(?:Montant|montant)[:\s]+([\d\s]+)\s*F\s*CFA/i) ||
        text.match(/Virement de\s+([\d\s]+)\s*FCFA/i);
    const phoneMatch = text.match(/(\+226\d{8})/);
    if (!amountMatch || !phoneMatch) return null;
    return {
        amount: parseInt(amountMatch[1].replace(/\s/g, ''), 10),
        phone: phoneMatch[1]
    };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const text = body.text || body.message || '';
        const parsed = parseSmsAmountAndPhone(text);

        if (!parsed) {
            return { statusCode: 200, body: 'SMS non reconnu' };
        }

        const { amount, phone } = parsed;

        const { data: user, error: userError } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', phone)
            .maybeSingle();

        if (userError) throw userError;
        if (!user) {
            return { statusCode: 200, body: 'Utilisateur non trouvé' };
        }

        const { error: creditError } = await supabase.rpc('credit_balance', {
            user_id: user.id,
            amount: amount
        });
        if (creditError) throw creditError;

        await supabase.from('transactions').insert({
            user_id: user.id,
            amount: amount,
            transaction_id: `SMS_${Date.now()}`,
            status: 'confirmed'
        });

        return { statusCode: 200, body: 'OK' };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: err.message };
    }
};
