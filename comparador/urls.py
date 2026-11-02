from django.urls import path
from . import views

urlpatterns = [
    path("", views.simulador, name="simulador"),
    path("recomendador/", views.quiz, name="quiz"),
]
