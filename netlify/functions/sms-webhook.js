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

        const amountMatch = text.match(/reçu (\d+) FCFA/);
        const senderMatch = text.match(/de (\+226\d+)/);

        if (!amountMatch || !senderMatch) {
            return { statusCode: 200, body: 'SMS non reconnu' };
        }

        const amount = parseInt(amountMatch[1]);
        const phone = senderMatch[1];

        const { data: user } = await supabase
            .from('profiles')
            .select('id')
            .eq('phone', phone)
            .single();

        if (!user) {
            return { statusCode: 200, body: 'Utilisateur non trouvé' };
        }

        await supabase.rpc('credit_balance', {
            user_id: user.id,
            amount: amount
        });

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
