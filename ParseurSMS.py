import re
from datetime import datetime

class SMSParser:
    def __init__(self):
        # Patterns pour différents opérateurs
        self.patterns = {
            'orange_money': {
                'sender_patterns': ['OM', 'Orange Money', 'orangemoney'],
                'regex': r'(?:Reçu de|reçu)\s*(?P<sender>[+\d]+)?.*? (?P<amount>[\d\s]+)\s*F\s*CFA',
                'amount_clean': lambda x: int(x.replace(' ', ''))
            },
            'wave': {
                'sender_patterns': ['Wave', 'WAVE'],
                'regex': r'vous avez reçu\s+(?P<amount>[\d\s]+)\s*F\s*CFA\s+de\s+(?P<sender>[+\d]+)',
                'amount_clean': lambda x: int(x.replace(' ', ''))
            },
            'moov_money': {
                'sender_patterns': ['Moov Money', 'Moov'],
                'regex': r'Virement de\s+(?P<amount>[\d\s]+)\s*FCFA\s+reçu de\s+(?P<sender>[+\d]+)',
                'amount_clean': lambda x: int(x.replace(' ', ''))
            }
        }

    def detect_operator(self, sms_text, sender):
        """Détecte l'opérateur — priorise l'expéditeur SMS, puis le contenu."""
        sender_l = (sender or '').lower()
        text_l = (sms_text or '').lower()

        # 1) Match sur l'expéditeur (plus fiable)
        for operator, config in self.patterns.items():
            for pattern in config['sender_patterns']:
                if pattern.lower() in sender_l:
                    return operator

        # 2) Match sur le texte (mots-clés opérateur, pas les numéros)
        for operator, config in self.patterns.items():
            for pattern in config['sender_patterns']:
                if pattern.lower() in text_l:
                    return operator
        return 'unknown'

    def parse(self, sms_text, sender_number):
        """Parse un SMS et retourne les informations structurées"""
        operator = self.detect_operator(sms_text, sender_number)

        if operator == 'unknown':
            return {
                'success': False,
                'error': 'Opérateur non reconnu',
                'raw_text': sms_text
            }

        pattern_config = self.patterns[operator]
        match = re.search(pattern_config['regex'], sms_text)

        if not match:
            return {
                'success': False,
                'error': 'Format SMS non reconnu pour cet opérateur',
                'operator': operator,
                'raw_text': sms_text
            }

        amount_raw = match.group('amount')
        amount = pattern_config['amount_clean'](amount_raw)
        sender = match.group('sender') if 'sender' in match.groupdict() else sender_number

        return {
            'success': True,
            'operator': operator,
            'amount': amount,
            'amount_fcfa': f"{amount:,} FCFA".replace(',', ' '),
            'sender': sender,
            'timestamp': datetime.now().isoformat(),
            'raw_text': sms_text
        }


# Exemples de SMS pour tester
test_sms = [
    {
        'text': 'Reçu de +22670123456. Montant: 1000 F CFA de la part de Jean. Nouveau solde: 5000 FCFA',
        'sender': 'Orange Money'
    },
    {
        'text': 'Wave: vous avez reçu 2500 F CFA de +22670123456. Code transaction: WAVE123456',
        'sender': 'Wave'
    },
    {
        'text': 'Virement de 1500 FCFA reçu de +22670123456 sur votre compte Moov Money. Merci',
        'sender': 'Moov Money'
    }
]

if __name__ == '__main__':
    parser = SMSParser()

    print("=" * 50)
    print("🧪 TEST DU PARSEUR DE SMS")
    print("=" * 50)

    for i, test in enumerate(test_sms, 1):
        print(f"\n📱 SMS #{i}")
        print(f"   Expéditeur: {test['sender']}")
        print(f"   Contenu: {test['text']}")

        result = parser.parse(test['text'], test['sender'])

        print(f"\n   📊 Résultat:")
        if result['success']:
            print(f"      ✅ Paiement validé")
            print(f"      🏦 Opérateur: {result['operator']}")
            print(f"      💰 Montant: {result['amount_fcfa']}")
            print(f"      👤 Expéditeur: {result['sender']}")
            print(f"      🕐 Reçu le: {result['timestamp']}")
        else:
            print(f"      ❌ Erreur: {result['error']}")
        print("-" * 40)
