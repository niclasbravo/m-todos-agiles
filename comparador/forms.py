from django import forms

from .instruments import INFLACION_DEFECTO
from .recomendador import PREGUNTAS


class SimuladorForm(forms.Form):
    inicial = forms.IntegerField(label="Monto inicial (CLP)", min_value=0, max_value=10**10, initial=1_000_000)
    aporte = forms.IntegerField(label="Aporte mensual (CLP)", min_value=0, max_value=10**9, initial=100_000)
    plazo = forms.IntegerField(label="Plazo", min_value=1, max_value=480, initial=5)
    unidad = forms.ChoiceField(label="Unidad", choices=[("anios", "años"), ("meses", "meses")], initial="anios")
    inflacion = forms.FloatField(label="Inflación anual esperada (%)", min_value=0, max_value=30,
                                 initial=INFLACION_DEFECTO)

    def clean(self):
        d = super().clean()
        if self.errors:
            return d
        d["meses"] = d["plazo"] * (12 if d["unidad"] == "anios" else 1)
        if d["meses"] > 480:
            raise forms.ValidationError("El plazo máximo es de 40 años.")
        if d["inicial"] == 0 and d["aporte"] == 0:
            raise forms.ValidationError("Ingresa un monto inicial o un aporte mensual.")
        return d


class QuizForm(forms.Form):
    """Perfil del usuario: 4 preguntas y el monto. El monto va al final para numerar solo las preguntas."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for p in PREGUNTAS:
            self.fields[p["id"]] = forms.ChoiceField(
                label=p["texto"], choices=p["opciones"], widget=forms.RadioSelect,
                error_messages={"required": "Elige una opción."})
        self.fields["monto"] = forms.IntegerField(
            label="¿Cuánto quieres ahorrar o invertir? (CLP)", min_value=1, max_value=10**10,
            error_messages={"required": "Ingresa un monto.", "invalid": "Ingresa solo números."})


class AjusteProyeccionForm(forms.Form):
    inflacion = forms.FloatField(label="Inflación anual esperada (%)", min_value=0, max_value=30,
                                 error_messages={"invalid": "Ingresa un número.", "required": "Ingresa la inflación."})
    meses = forms.IntegerField(label="Horizonte (meses)", min_value=1, max_value=480,
                               error_messages={"invalid": "Ingresa meses completos.", "required": "Ingresa el horizonte."})
    aporte = forms.IntegerField(label="Aporte mensual (CLP)", min_value=0, max_value=10**9, initial=0,
                                error_messages={"invalid": "Ingresa solo números.", "required": "Ingresa un aporte (puede ser 0)."})
